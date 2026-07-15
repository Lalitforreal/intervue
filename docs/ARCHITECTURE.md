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

---

## Session states

- PRE_START — session created by interviewer, guest has not joined yet.
- ONGOING — guest has joined, interview is active.
- ENDED — session was explicitly ended.

---

## Sessions table

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Unique session identifier |
| interviewer_id | UUID | The user who created the session |
| guest_id | UUID | Nullable — NULL until guest joins |
| status | ENUM | PRE_START, ONGOING,ON_HOLD, ENDED |
| created_at | TIMESTAMP | When the session row was created |
| started_at | TIMESTAMP | Nullable — when status moved to ONGOING |
| ended_at | TIMESTAMP | Nullable — when status moved to ENDED |
| ended_reason | ENUM | NORMAL, EXPIRED, ABANDONED |

the replay events can be fetched by querying the events using session id.

---

## Why guest_id is nullable -

The session exists in PRE_START before the guest joins.

NULL guest_id = waiting for guest. This is intentional, not a gap.

---

## Session states

- PRE_START — session created, guest has not joined yet.
- ONGOING — guest joined, interview is active.
- ON_HOLD — interviewer disconnected mid-session. Guest sees waiting
  screen. Auto-ends if interviewer doesn't reconnect within
  X minutes.
- ENDED — session ended, either normally or via expiry.

---

## ended_reason field (add to sessions table)

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

This guest token is used to authenticate all the future socket events
from the guest. guest_id is stored as the actor on every event in the
event log so replay knows who did what.

### Can the same person be both?

No. The tool exists for two-person
interviews. One interviewer, one candidate. Same person being both
defeats the purpose entirely.

---

## Users table (interviewers only)

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Unique user identifier |
| email | TEXT | Unique |
| password | TEXT | Bcrypt hashed |
| role | ENUM | INTERVIEWER (extendable) |
| created_at | TIMESTAMP | |

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
| id | UUID | Unique event identifier |
| session_id | UUID | Foreign key to sessions table |
| sequence_number | INTEGER | Strict ordering. Two events in same millisecond are still ordered correctly. This is what makes replay possible. |
| type | ENUM | The event type |
| actor_id | UUID | Who trigger's it — interviewer or guest ID |
| actor_role | ENUM | INTERVIEWER or GUEST |
| payload | JSONB | Event-specific data (see payload shapes below) |
| created_at | TIMESTAMP | When the event occurred |

---

## Why sequence_number and not just timestamp?

Two events can occur within the same millisecond. Timestamp alone cannot
guarantee strict ordering. Sequence number is an auto-incrementing integer
scoped to the session — it guarantees you always know which event came first.
Note - sequence_number is NOT assigned by the client. It is assigned by the 
server inside a database transaction

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
| CURSOR_MOVED | BOTH | Cursor position changed (different colors per role in the extension UI) |
| CODE_HIGHLIGHTED | INTERVIEWER | Interviewer highlighted a code section |
| LANGUAGE_CHANGED | INTERVIEWER | Programming language switched mid-session |
| PROBLEM_SET | INTERVIEWER | Interviewer set or updated the problem statement in the panel |
| GUEST_DISCONNECTED | SYSTEM | Guest lost connection unintentionally |
| GUEST_RECONNECTED | SYSTEM | Guest reconnected after disconnect |
| GUEST_TOKEN_EXPIRED | SYSTEM | Guest temporary token expired mid-session |
| GUEST_LEFT | GUEST | Guest intentionally closed the session |
| INTERVIEWER_DISCONNECTED | SYSTEM | Interviewer lost connection, session moves to ON_HOLD |
| INTERVIEWER_RECONNECTED | SYSTEM | Interviewer reconnected, session moves back to ONGOING |
| SESSION_ENDED | INTERVIEWER | Interviewer explicitly ended the session |
| SESSION_ABANDONED | SYSTEM | Session ended because interviewer didn't reconnect within timeout window |
| SESSION_EXPIRED | SYSTEM | Nobody joined within 30 minutes of PRE_START |

---

## Payload shapes per event type

### CODE_CHANGED

```ts
{
  content: string
  cursorPosition: {
    line: number
    character: number
  }
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
  reason: NORMAL | ABANDONED | EXPIRED
}
```

---

## Note - SYSTEM events

SYSTEM events are emitted by the server itself, not by a client.

actor_id for SYSTEM events is null.

actor_role is SYSTEM.

These events exist so replay knows exactly what happened at every
moment — including disconnects and reconnections.

---

## If your database got wiped and you only had the event log, could you reconstruct the entire session? What would be missing?

### What the event log can and cannot reconstruct

CAN reconstruct:

- Full code timeline from first keystroke to last
- Every cursor position at every moment
- Every highlight, language change, problem set
- Complete replay of the entire session
- Who (by actor_id) did what and in what order

CANNOT reconstruct without sessions + users tables:

- Real identity of the interviewer (name, email)
- Session metadata (status history, timeout settings)
- Official start and end timestamps of the session
- Context of how and when the guest was admitted

Conclusion:

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
the pattern is one person typing and one person observing — not two
people typing simultaneously.

Known better solutions: Operational Transformation (OT), CRDTs.

Decision: Last write wins for V1. Architecture supports upgrading later
without changing the event schema — sequence numbers remain valid in any
conflict resolution strategy.

---

## What happens when a user loses connection and reconnects?

### ON DISCONNECT

- Server starts a grace period timer (e.g. 30 seconds)
- If interviewer: session moves to ON_HOLD, guest sees waiting screen
- If guest: session stays ONGOING, interviewer is notified
- Session is NOT ended. All data preserved.
- GUEST_DISCONNECTED or INTERVIEWER_DISCONNECTED event written to log

### ON RECONNECT (within grace period)

- User rejoins with same JWT (interviewer) or guest token (guest)
- run a query
- Server sends two things:
  1. All missed events (for replay integrity, no gaps)
  2. Latest CODE_CHANGED payload (for immediate editor sync)
- Session moves back to ONGOING
- GUEST_RECONNECTED or INTERVIEWER_RECONNECTED event written to log

### IF GRACE PERIOD EXPIRES WITHOUT RECONNECT

- Interviewer: session moves to ABANDONED, guest is notified
- Guest: session moves to ENDED, interviewer is notified

---

## What happens if the server crashes mid-session?

### LOST FOREVER (in-memory only)

- Active socket connections and socket IDs
- Socket.IO room memberships
- socket.data contents (role, user_id, session_id per connection)
- Any event that was received by the server but not yet written to PostgreSQL
  (the window between receiving a socket event and completing the DB write)

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

This guarantees your event log is always consistent with
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

For each event type we care about, find the last
occurrence at or before N:

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
    interviewer: { line, character }
    guest: { line, character }
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

---

# Questions Answered

## Section 1 — The session

- What is a session in this system? Describe it in plain English like you're explaining it to someone who hasn't seen your idea.
- What are all the states a session can be in? Think about the full lifecycle — before anyone joins, while it's active, after it ends.
- Who can create a session? Who can join? Can the same person be both?

## Section 2 — The event

- What is an event in this system? What's the minimum information an event must carry to make replay possible?
- What types of events exist? List every single thing that can happen in a session that you'd want to record.
- If your database got wiped and you only had the event log, could you reconstruct the entire session? What would be missing?

## Section 3 — The hard problems

- What happens if two users type at exactly the same time? What does your system do?
- What happens if a user loses internet for 30 seconds and reconnects? What state are they in? What do they need from the server?
- What happens if the server crashes while a session is active? What's lost? What's recoverable?

## Section 4 — The replay

- How does replay work in plain English? Walk through it step by step.
- What does "reconstruct state at sequence number 47" actually mean computationally?