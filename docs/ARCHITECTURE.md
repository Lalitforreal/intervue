# VS Code Real-Time Coding Interview Extension

---

# Section 1 — The Session

## What is a session in this system?

A session is a time-bounded space from the moment an interview is created
till the moment it ends. It has two roles — an interviewer and a guest.
The interviewer creates the session, the guest joins via a session ID.

The session tracks who is in it, what state it is in, and when key
moments happened. The replay of everything that occurred inside the
session is not stored on the session itself — it is derived from the
event log (events table) by querying all events for this session ID
ordered by sequence number.

**PostgreSQL is the source of truth for all session state. The in-memory
SessionManager has been removed. All reads and writes go through the database.**

---

## Session states

- PRE_START — session created by interviewer, guest has not joined yet.
- ONGOING — guest has joined, interview is active.
- ON_HOLD — interviewer disconnected mid-session. Guest sees waiting
  screen. Auto-ends if interviewer doesn't reconnect within X minutes.
- ENDED — session ended, either normally or via expiry.

---

## Sessions table

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Unique session identifier |
| interviewer_id | UUID | Foreign key to users(id) |
| guest_id | TEXT | Nullable — NULL until guest joins |
| status | ENUM | PRE_START, ONGOING, ON_HOLD, ENDED |
| created_at | TIMESTAMP | When the session row was created |
| started_at | TIMESTAMP | Nullable — when status moved to ONGOING |
| ended_at | TIMESTAMP | Nullable — when status moved to ENDED |
| ended_reason | ENUM | NORMAL, EXPIRED, ABANDONED |

The replay events can be fetched by querying the events table using session_id.

---

## Why guest_id is nullable

The session exists in PRE_START before the guest joins.

NULL guest_id = waiting for guest. This is intentional, not a gap.

---

## ended_reason field

- NORMAL — interviewer explicitly ended the session
- EXPIRED — nobody joined within 30 minutes (PRE_START timeout)
- ABANDONED — interviewer didn't reconnect within X minutes of ON_HOLD

---

## Who can create a session? Who can join? Can the same person be both?

### Creating a session

Only authenticated interviewers can create a session.

Auth via JWT stored in HTTP-only cookie.

JWT contains: user_id, role (INTERVIEWER).

### Joining a session

Guests do not need an account.

Guest provides session ID only.

On join, server validates session exists and is in PRE_START state,
then generates a temporary guest token containing:

- generated guest_id (UUID)
- session_id
- expiry (decided at session creation by interviewer)

This guest token is used to authenticate all future socket events
from the guest. guest_id is stored as the actor on every event in the
event log so replay knows who did what.

### Can the same person be both?

No. The tool exists for two-person interviews. One interviewer, one candidate.
Same person being both defeats the purpose entirely.

---

## Users table (interviewers only)

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Unique user identifier — gen_random_uuid() |
| email | TEXT | Unique, NOT NULL |
| password | TEXT | Bcrypt hashed |
| created_at | TIMESTAMP | Default NOW() |

No role column — the users table is interviewers only. Role is implicit from the table itself.

---

# Section 2 — The Event

## What is an event?

An event is an immutable record of anything that happened during a session.

The event log is the source of truth. Current state is derived from the
event log, not stored separately. This means any point in time during
the session can be reconstructed by replaying events up to that sequence number.

---

## Minimum fields every event must carry

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Unique event identifier — gen_random_uuid() |
| session_id | UUID | Foreign key to sessions(id) |
| sequence_number | INTEGER | Strict ordering per session. Assigned by server inside a transaction. |
| event_type | ENUM | The event type |
| actor_id | UUID | Who triggered it — NULL for SYSTEM events |
| actor_role | ENUM | INTERVIEWER, GUEST, or SYSTEM |
| payload | JSONB | Event-specific data. Default '{}' |
| created_at | TIMESTAMP | When the event occurred |

---

## persistEvent utility

All event writes go through `src/utils/persistEvent.ts`.

This utility handles:
1. SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_seq WHERE session_id = $1
2. INSERT INTO events with the computed sequence number

It must be called inside an existing transaction client — it does not
manage its own BEGIN/COMMIT. The caller owns the transaction.

```ts
await persistEvent(sessionId, client, eventType, actorId, actorRole, payload);
```

---

## Commit before broadcast

Events are written to PostgreSQL before broadcasting to clients.

If the DB write fails, the event is rejected — no broadcast happens.

This guarantees the event log is always consistent with what clients
have received. No phantom events.

```
START TRANSACTION
  → INSERT session (if applicable)
  → persistEvent (sequence + INSERT)
COMMIT
→ socket.emit / io.to().emit
```

---

## Why sequence_number and not just timestamp?

Two events can occur within the same millisecond. Timestamp alone cannot
guarantee strict ordering. Sequence number is an integer scoped to the session —
it guarantees strict ordering regardless of timing.

sequence_number is NOT assigned by the client. It is assigned by the server
inside a database transaction using COALESCE(MAX(sequence_number), 0) + 1
with FOR UPDATE locking where needed to prevent race conditions.

A UNIQUE(session_id, sequence_number) constraint enforces this at the DB level.

---

## Why JSONB for payload?

Different event types carry different data. CODE_CHANGED carries content
and cursor position. CURSOR_MOVED carries only position. Storing payload
as JSONB means one events table handles all types cleanly without
nullable columns everywhere.

---

## Event types

| Event Type | Emitted by | Meaning |
|------------|------------|---------|
| SESSION_CREATED | INTERVIEWER | Session row created, waiting for guest |
| SESSION_JOINED | GUEST | Guest joined, session moves to ONGOING |
| CODE_CHANGED | BOTH | Any keystroke or edit in the editor |
| CURSOR_MOVED | BOTH | Cursor position changed |
| CODE_HIGHLIGHTED | INTERVIEWER | Interviewer highlighted a code section |
| LANGUAGE_CHANGED | INTERVIEWER | Programming language switched mid-session |
| PROBLEM_SET | INTERVIEWER | Interviewer set or updated the problem statement |
| GUEST_DISCONNECTED | SYSTEM | Guest lost connection unintentionally |
| GUEST_RECONNECTED | SYSTEM | Guest reconnected after disconnect |
| GUEST_TOKEN_EXPIRED | SYSTEM | Guest temporary token expired mid-session |
| GUEST_LEFT | GUEST | Guest intentionally closed the session |
| INTERVIEWER_DISCONNECTED | SYSTEM | Interviewer lost connection, session moves to ON_HOLD |
| INTERVIEWER_RECONNECTED | SYSTEM | Interviewer reconnected, session moves back to ONGOING |
| SESSION_ENDED | INTERVIEWER | Interviewer explicitly ended the session |
| SESSION_ABANDONED | SYSTEM | Session ended because interviewer didn't reconnect within timeout |
| SESSION_EXPIRED | SYSTEM | Nobody joined within 30 minutes of PRE_START |

---

## Payload shapes per event type

### CODE_CHANGED

```ts
{
  content: string
  cursorPosition: { line: number; character: number }
  language: string
}
```

### CURSOR_MOVED

```ts
{
  line: number
  character: number
}
```

### CODE_HIGHLIGHTED

```ts
{
  startLine: number
  endLine: number
  startCharacter: number
  endCharacter: number
  color: string
}
```

### LANGUAGE_CHANGED

```ts
{
  from: string
  to: string
}
```

### PROBLEM_SET

```ts
{
  title: string
  description: string
  constraints: string
  examples: string
}
```

### SESSION_JOINED

```ts
{
  guest_id: string
}
```

### SESSION_ENDED / SESSION_ABANDONED / SESSION_EXPIRED

```ts
{
  reason: 'NORMAL' | 'ABANDONED' | 'EXPIRED'
}
```

---

## Note — SYSTEM events

SYSTEM events are emitted by the server itself, not by a client.

actor_id for SYSTEM events is null.

actor_role is SYSTEM.

These events exist so replay knows exactly what happened at every
moment — including disconnects and reconnections.

---

## If your database got wiped and you only had the event log, could you reconstruct the entire session?

### CAN reconstruct

- Full code timeline from first keystroke to last
- Every cursor position at every moment
- Every highlight, language change, problem set
- Complete replay of the entire session
- Who (by actor_id) did what and in what order

### CANNOT reconstruct without sessions + users tables

- Real identity of the interviewer (name, email)
- Session metadata (status history, timeout settings)
- Official start and end timestamps of the session
- Context of how and when the guest was admitted

### Conclusion

events table = source of truth for WHAT happened.

sessions + users tables = source of truth for WHO and WHEN (metadata).

Both are required. Neither replaces the other.

---

# Section 3 — The Hard Problems

## What happens if two users type at exactly the same time?

Node.js is single threaded. The server receives concurrent events one
at a time and assigns sequence numbers in arrival order. Events are
naturally serialized at the server level.

On the client side, last write wins by sequence number. Both clients
apply all incoming events in sequence number order and converge to the
same state. An edit with a higher sequence number overwrites a lower one.

Tradeoff: In cases of true simultaneous edits, one user's keystroke
gets overwritten. This is a V1 solution for a coding interview tool where
the pattern is one person typing and one person observing.

Known better solutions: Operational Transformation (OT), CRDTs.

Decision: Last write wins for V1. Architecture supports upgrading later
without changing the event schema.

---

## What happens when a user loses connection and reconnects?

### ON DISCONNECT

- Grace period: 30 seconds for both roles
- If interviewer: session immediately moves to ON_HOLD. Guest sees waiting screen.
- If guest: session stays ONGOING. Interviewer is notified.
- Session is NOT ended. All data preserved.
- GUEST_DISCONNECTED or INTERVIEWER_DISCONNECTED event written to log.
- Both start a 30 second setTimeout on disconnect.
- If grace period expires without reconnect → session moves to ENDED, ended_reason ABANDONED, SESSION_ABANDONED event persisted, room notified via session_ended emit.

### GUEST DISCONNECT TRACKING (V1)

Guest reconnection is tracked using an in-memory Set (disconnectedGuests).
- On disconnect: guest userId added to Set.
- On reconnect: guest userId removed from Set.
- Inside setTimeout: if userId still in Set, grace period expired without reconnect.

V2 upgrade path: add guest_disconnected_at TIMESTAMP column to sessions table.
This survives server crashes unlike the in-memory Set.

### CLIENT RESPONSIBILITY

The client tracks the latest sequence_number from every event it receives.
On reconnect, the client sends this last known sequence number to the server.

### ON RECONNECT (within grace period)

- User rejoins with same JWT (interviewer) or guest token (guest)
- Client sends last known sequence_number
- Server queries: SELECT * FROM events WHERE session_id = $1 AND sequence_number > $2 ORDER BY sequence_number ASC
- Server sends two things:
  1. All missed events (for replay integrity, no gaps)
  2. Latest CODE_CHANGED payload (for immediate editor sync)
- Session moves back to ONGOING
- GUEST_RECONNECTED or INTERVIEWER_RECONNECTED event written to log

### IF GRACE PERIOD EXPIRES WITHOUT RECONNECT

- Both roles: session moves to ENDED, ended_reason ABANDONED
- Room notified via session_ended emit

---

## What happens if the server crashes mid-session?

### LOST FOREVER (in-memory only)

- Active socket connections and socket IDs
- Socket.IO room memberships
- socket.data contents (role, user_id, session_id per connection)
- Any event received but not yet written to PostgreSQL
- disconnectedGuests Set (guest disconnect tracking)

### FULLY RECOVERABLE (in PostgreSQL)

- All persisted events and the complete event log
- Session metadata and current status
- Interviewer identity and guest_id
- The entire replay up to the last persisted event

### ON SERVER RESTART

- All clients detect disconnect and attempt reconnection
- Interviewer reconnects with JWT → session restored from DB
- Guest reconnects with guest token → session restored from DB
- Both receive missed events via sequence number query
- Session continues from last persisted event

### KEY INSIGHT

Write events to PostgreSQL before broadcasting to clients.

If the DB write fails, reject the event — don't broadcast it.

This guarantees the event log is always consistent with
what clients have received. No phantom events.

---

# Section 4 — The Replay

## How does replay work in plain English?

The replay engine reconstructs the exact state of the session at any
given sequence number. The user sees a timeline they can drag back and
forth. At each position, the editor reflects the code, cursor positions,
language, and problem statement exactly as they were at that moment.

---

## What does "reconstruct state at sequence number N" mean computationally?

### Step 1

Receive a request for state at sequence number N.

### Step 2

Query the events table for all events in this session
where sequence_number <= N, ordered by sequence_number ASC.

### Step 3

For each event type we care about, find the last occurrence at or before N:

- CODE_CHANGED
- CURSOR_MOVED
- LANGUAGE_CHANGED
- PROBLEM_SET

### Step 4

Return the reconstructed state object:

```ts
{
  code: string
  cursors: {
    interviewer: { line: number; character: number }
    guest: { line: number; character: number }
  }
  language: string
  problem: {
    title: string
    description: string
    constraints: string
    examples: string
  }
}
```

---

## The replay engine is a pure function

Given the same event log and the same sequence number, it always
returns the same state. No side effects, no external dependencies.
This makes it trivially testable — feed it a known event log,
assert the output at every sequence number.

---

## Why this approach is powerful

- No separate snapshot storage needed
- Any point in time is reconstructable from the event log alone
- Adding new replayable event types requires zero schema changes
- The replay engine has no knowledge of the session, only the events