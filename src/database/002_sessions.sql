CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE sessions(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    interviewer_id UUID NOT NULL REFERENCES users(id), --in the users table - foreign key here

    guest_id TEXT, -- can be null
    status session_status,
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    ended_reason ended_reason
);