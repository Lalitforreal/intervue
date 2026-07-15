# intervue

A VS Code extension for real-time technical interviews — live code sync, role-based sessions, and full session replay from an immutable event log.

## The Problem

Most remote technical interviews rely on screen sharing. The interviewer watches passively while the candidate codes, unable to interact directly with the editor, unable to point at a specific line, unable to review what happened after the session ends. There is no record of the process — only the final result.

Interview platforms that do offer collaborative editors treat it as a generic feature. They sync text between two windows and stop there. There is no structure for roles, no session lifecycle, and no way to go back and understand how a candidate actually arrived at a solution.

## The Idea

intervue treats an interview as a sequence of events, not a shared document.

Every keystroke, cursor movement, and language switch is captured as an individual, timestamped event and written to an append-only log. The current state of the editor — the code, the cursor positions, the active problem — is never stored directly. It is derived by replaying the event log up to any point in time.

This means the entire interview can be reconstructed after it ends. Not just the final code, but the exact path the candidate took to get there — where they paused, what they tried first, where they backtracked.

## How It Works

An interviewer creates a session from within VS Code and shares a session ID with the candidate. The candidate joins using that ID — no account required. Both editors connect to a backend over WebSockets, and from that point on, every change either person makes is broadcast to the other in real time.

Behind the scenes, each change is written to PostgreSQL as an event with a strictly increasing sequence number before it is broadcast to any client. If the database write fails, the event is never sent — this guarantees the event log is always the single source of truth for what actually happened.

When the interview ends, the session can be replayed. A timeline lets you scrub back and forth through the interview, and at any point, the editor reconstructs exactly what the code, cursors, and problem statement looked like at that moment — computed live from the event log, not from a stored snapshot.

## Architecture
Core session and replay architecture designed and documented in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

### Overlook ->

**Backend** — Node.js, Express, TypeScript, Socket.IO. Fully typed socket event contracts using `ClientToServerEvents`, `ServerToClientEvents`, and `SocketData` generics, so payload mismatches are caught at compile time rather than at runtime.

**Auth** — JWT-based authentication for interviewers via HTTP-only cookies, verified in a custom `io.use()` middleware at the socket handshake. Candidates join with a short-lived, session-scoped guest token generated on join — no signup required.

**Persistence** — PostgreSQL stores two things: session metadata (who created it, its current status, when it started and ended) and the immutable event log (every action, in order, tied to a session). The event log is the source of truth for *what* happened. The sessions table is the source of truth for *who* and *when*. Neither replaces the other.

**Replay engine** — A pure function that takes a session ID and a target sequence number, and returns the reconstructed editor state at that exact point in the interview. For each event type — code, cursor, language, problem — it finds the most recent occurrence at or before that sequence number. Same input always produces the same output, which makes it simple to reason about and simple to test.

**Extension client** — Built on the VS Code Extension API. Uses `workspace.onDidChangeTextDocument` to capture edits and `TextEditorDecorationType` to render the other participant's cursor in a distinct color, directly inside the editor.

## Session Lifecycle

A session moves through a defined set of states rather than being a loose, always-on connection:

PRE_START  → session created, waiting for the candidate to join
ONGOING    → candidate joined, interview is active
ON_HOLD    → interviewer disconnected; session paused, not ended
ENDED      → session concluded, either normally, by expiry, or by timeout

Disconnections are treated as a first-class scenario rather than an edge case. If a participant loses connection, the session enters a grace period instead of ending immediately. On reconnect, the client is sent every event it missed — queried by sequence number — so the event log has no gaps and the editor snaps back in sync immediately.

## Why Event Sourcing

The alternative was to store the current document state directly and overwrite it on every change — simpler to implement, but it destroys history. The moment a change is saved, the previous state is gone.

Event sourcing trades some storage overhead for a system where nothing is ever lost. Every decision a candidate makes during an interview stays recoverable, inspectable, and replayable — long after the session has ended.

## Tech Stack

Node.js · Express · TypeScript · Socket.IO · PostgreSQL · VS Code Extension API

## Status

Actively in development. Core session and replay architecture designed and documented in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).
