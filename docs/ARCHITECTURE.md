# intervue — Architecture

> VS Code extension for real-time technical interviews. Live code sync, role-based sessions, cursor tracking, problem panel, and full session replay from an immutable event log.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Session Model](#session-model)
- [Event Sourcing](#event-sourcing)
- [Real-Time Sync](#real-time-sync)
- [Replay Engine](#replay-engine)
- [Reconnection & Fault Tolerance](#reconnection--fault-tolerance)
- [VS Code Extension](#vs-code-extension)
- [Key Design Decisions](#key-design-decisions)
- [V2 Roadmap](#v2-roadmap)

---

## Overview

intervue is a two-person system — one interviewer, one candidate (guest). The interviewer creates a session from VS Code, the guest joins via session ID. Everything that happens inside the session — keystrokes, cursor moves, language changes, problem statements — is recorded as an immutable event in PostgreSQL. Current state is always derived from the event log, never stored separately. This makes full session replay possible at any sequence number with no additional infrastructure.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express, TypeScript |
| Real-time | Socket.IO |
| Database | PostgreSQL (via `node-postgres`) |
| Extension | VS Code Extension API, socket.io-client, axios |
| Auth | JWT (interviewer), temporary UUID guest token |
| Dev | `tsx watch`, ESM modules, `tsconfig` strict mode |

---

## Session Model

### States

```
PRE_START → ONGOING → ON_HOLD → ENDED
```

| State | Meaning |
|---|---|
| PRE_START | Session created, guest not yet joined |
| ONGOING | Guest joined, interview active |
| ON_HOLD | Interviewer disconnected, 30s grace period running |
| ENDED | Session over — NORMAL, ABANDONED, or EXPIRED |

### Sessions Table

| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| interviewer_id | UUID | FK to users |
| guest_id | TEXT | NULL until guest joins |
| status | ENUM | PRE_START / ONGOING / ON_HOLD / ENDED |
| created_at | TIMESTAMP | Row creation time |
| started_at | TIMESTAMP | When guest joined |
| ended_at | TIMESTAMP | When session ended |
| ended_reason | ENUM | NORMAL / EXPIRED / ABANDONED |

### Auth

- **Interviewer** — JWT in HTTP-only cookie + response body (for extension). Contains `user_id` and role.
- **Guest** — No account needed. Server generates a temporary UUID-scoped guest token on join. No expiry in V1.

---

## Event Sourcing

### Core Principle

PostgreSQL is the source of truth. Current state is never stored directly — it is always derived from the event log by replaying events up to a given sequence number.

### Events Table

| Field | Type | Notes |
|---|---|---|
| id | UUID | `gen_random_uuid()` |
| session_id | UUID | FK to sessions |
| sequence_number | INTEGER | Strict per-session ordering, server-assigned |
| event_type | ENUM | See event types below |
| actor_id | UUID | NULL for SYSTEM events |
| actor_role | ENUM | INTERVIEWER / GUEST / SYSTEM |
| payload | JSONB | Event-specific data |
| created_at | TIMESTAMP | `NOW()` |

A `UNIQUE(session_id, sequence_number)` constraint enforces ordering at the DB level.

### Why Sequence Numbers Instead of Timestamps

Two events can arrive within the same millisecond. Timestamps cannot guarantee strict ordering. Sequence numbers are integers scoped per session, assigned by the server inside a transaction using:

```sql
SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_seq
FROM events
WHERE session_id = $1
FOR UPDATE
```

### persistEvent Utility

All event writes go through `src/utils/persistEvent.ts`. It computes the next sequence number and inserts the event. It must be called inside an existing transaction — the caller owns `BEGIN` / `COMMIT`.

```ts
await persistEvent(sessionId, client, eventType, actorId, actorRole, payload);
```

### Write Before Broadcast

Events are written to PostgreSQL before broadcasting to clients. If the DB write fails, no broadcast happens. This guarantees the event log is always consistent with what clients have received — no phantom events.

```
BEGIN TRANSACTION
  → persistEvent (sequence + INSERT)
COMMIT
→ socket.to(sessionId).emit(...)
```

### Event Types

| Event | Actor | Meaning |
|---|---|---|
| SESSION_CREATED | INTERVIEWER | Session created, waiting for guest |
| SESSION_JOINED | GUEST | Guest joined, session moves to ONGOING |
| CODE_CHANGED | BOTH | Editor content changed |
| CURSOR_MOVED | BOTH | Cursor position changed |
| CODE_HIGHLIGHTED | INTERVIEWER | Code section highlighted |
| LANGUAGE_CHANGED | INTERVIEWER | Language switched |
| PROBLEM_SET | INTERVIEWER | Problem statement set or updated |
| GUEST_DISCONNECTED | SYSTEM | Guest lost connection |
| GUEST_RECONNECTED | SYSTEM | Guest reconnected within grace period |
| GUEST_TOKEN_EXPIRED | SYSTEM | Guest token expired mid-session |
| GUEST_LEFT | GUEST | Guest intentionally left |
| INTERVIEWER_DISCONNECTED | SYSTEM | Interviewer disconnected, session → ON_HOLD |
| INTERVIEWER_RECONNECTED | SYSTEM | Interviewer reconnected, session → ONGOING |
| SESSION_ENDED | INTERVIEWER | Interviewer explicitly ended session |
| SESSION_ABANDONED | SYSTEM | Interviewer didn't reconnect within grace period |
| SESSION_EXPIRED | SYSTEM | Nobody joined within 30 minutes of PRE_START |

### Payload Shapes

```ts
// CODE_CHANGED
{ content: string; cursorPosition: { line: number; character: number }; language: string }

// CURSOR_MOVED
{ line: number; character: number }

// PROBLEM_SET
{ title: string; description: string; constraints: string; examples: string }

// LANGUAGE_CHANGED
{ from: string; to: string }

// CODE_HIGHLIGHTED
{ startLine: number; endLine: number; startCharacter: number; endCharacter: number; color: string }
```

---

## Real-Time Sync

### Live Code Sync Flow

```
onDidChangeTextDocument (VS Code)
  → emitSocket("code_change", sessionId, { content, cursorPosition, language })
  → backend: BEGIN → persistEvent(CODE_CHANGED) → COMMIT → socket.to(sessionId).emit("code_updated")
  → remote client: editor.edit() replaces full document content
```

### Cursor Tracking

Cursor positions are broadcast in real-time but **not persisted** — cursor state is already embedded in every `CODE_CHANGED` payload and is therefore available for replay without redundant storage.

```
onDidChangeTextEditorSelection (VS Code)
  → emitSocket("cursor_move", sessionId, { line, character })
  → backend: socket.to(sessionId).emit("cursor_updated", { role, line, character })
  → remote client: TextEditorDecorationType rendered at position
```

Remote cursors are color-coded by role (interviewer = red, guest = yellow).

### Problem Panel

- Interviewer runs `intervue.setProblem` → webview form opens
- On submit → `emitSocket("problem-set", sessionId, payload)` → persisted as `PROBLEM_SET` event → broadcast to guest
- Guest receives `problem-set-updated` → guest webview opens/updates
- Late join: on `join_session`, server queries last `PROBLEM_SET` event and emits directly to the joining guest

---

## Replay Engine

### How It Works

The replay engine is a pure function. Given a `sessionId` and a `sequenceN`, it returns the exact state of the session at that point in time — code, cursors, language, and problem statement.

```ts
replayFunc(sessionId: string, sequenceN: number, pool: Pool): Promise<Partial<ReplayState>>
```

### Reconstructed State

```ts
{
  code: string
  cursors: {
    interviewer: { line: number; character: number }
    guest: { line: number; character: number }
  }
  language: string
  problem: { title: string; description: string; constraints: string; examples: string }
}
```

### Implementation

Uses PostgreSQL `DISTINCT ON` to find the last occurrence of each relevant event type at or before sequence N in a single query — no in-code looping:

```sql
SELECT DISTINCT ON (event_type) *
FROM events
WHERE session_id = $1
  AND sequence_number <= $2
  AND event_type = ANY($3)
ORDER BY event_type, sequence_number DESC
```

No caching. State is always derived fresh from the event log. No separate snapshot storage required.

---

## Reconnection & Fault Tolerance

### On Disconnect

- 30-second grace period for both roles
- Interviewer disconnect → session moves to `ON_HOLD`, guest notified
- Guest disconnect → session stays `ONGOING`, interviewer notified
- `INTERVIEWER_DISCONNECTED` or `GUEST_DISCONNECTED` event persisted
- If grace period expires → session moves to `ENDED` / `ABANDONED`

### On Reconnect (within grace period)

Client sends its last known `sequence_number`. Server responds with:

1. All missed events (`sequence_number > lastKnown`)
2. Latest `CODE_CHANGED` payload for immediate editor sync

Session moves back to `ONGOING`. Reconnect event persisted.

### Server Crash Recovery

| Lost (in-memory) | Recoverable (PostgreSQL) |
|---|---|
| Socket connections and room memberships | Full event log |
| `socket.data` (role, userId, sessionId) | Session metadata and status |
| `disconnectedGuests` Set | Interviewer identity and guest_id |
| Unbroadcasted events | Complete replay up to last persisted event |

All clients detect disconnect and reconnect. Both roles re-authenticate (JWT / guest token) and resume from last known sequence number.

### Concurrent Edits (V1)

Node.js serializes incoming events. Sequence numbers are assigned in arrival order. Last write wins — the event with the higher sequence number overwrites lower ones on all clients. This is a deliberate V1 tradeoff for a tool where the expected pattern is one person typing at a time.

---

## VS Code Extension

### Structure

```
vscode-extension/intervue/src/
  auth/
    auth.ts           — POST /login, stores JWT in context.secrets
  sockets/
    connection.ts     — socket.io-client, role-aware handshake.auth, emitSocket()
  types/              — Role, SessionRow, SessionStatus, EndedReason, ProblemSetPayload
  utils/
    webView.ts        — Interviewer problem form HTML
    guestWebView.ts   — Guest problem display HTML
  extension.ts        — activate(), commands, listeners
```

### Commands

| Command | Role | Action |
|---|---|---|
| `intervue.interviewerLogin` | INTERVIEWER | Login → connect socket → create session |
| `intervue.guestLogin` | GUEST | Enter session ID → connect socket → join session |
| `intervue.setProblem` | INTERVIEWER | Open problem form webview |

### Key Listeners

| Event | Direction | Action |
|---|---|---|
| `onDidChangeTextDocument` | Local → Server | Emit `code_change` with full content |
| `onDidChangeTextEditorSelection` | Local → Server | Emit `cursor_move` with position |
| `code_updated` | Server → Remote | Replace full editor content |
| `cursor_updated` | Server → Remote | Render decoration at position |
| `problem-set-updated` | Server → Guest | Open/update guest problem webview |

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Event sourcing over direct state storage | Any point in time is reconstructable; no separate snapshot infrastructure needed |
| Sequence numbers over timestamps | Strict ordering regardless of clock skew or sub-millisecond concurrency |
| JSONB payload per event type | One events table handles all types cleanly without nullable columns |
| Write to DB before broadcast | Event log is always consistent with what clients have received |
| No cursor event persistence | Cursor state is embedded in every CODE_CHANGED payload; redundant to store separately |
| Last write wins for concurrent edits | Sufficient for V1 interview tool; architecture supports OT/CRDT upgrade without schema changes |
| Full content per CODE_CHANGED (V1) | Simpler implementation; delta diffing deferred to V2 |
| PostgreSQL as sole source of truth | In-memory SessionManager removed; all reads and writes go through the DB |
| Guest token, no account required | Reduces friction for candidates; UUID-scoped temporary identity |
| 30-second grace period on disconnect | Handles accidental disconnects without ending sessions prematurely |

---

## V2 Roadmap

| Feature | Purpose |
|---|---|
| Operational Transformation / CRDTs | Replace last-write-wins with proper concurrent edit resolution |
| Delta diffing on CODE_CHANGED | Send only the diff per event instead of full content; reduces payload size |
| Redis pub/sub | Multi-instance backend scaling; hot session state caching |
| Refresh token rotation | Proper access/refresh token lifecycle; currently JWT has no expiry |
| User registration flow | Signup route for interviewers; currently inserted manually |
| `guest_disconnected_at` column | Survive server crashes for guest grace period tracking; replace in-memory Set |
| TypeScript strict improvements | Tighten remaining `any` types across extension and backend |