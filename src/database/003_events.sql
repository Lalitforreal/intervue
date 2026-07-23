CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE events(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id), -- primary key of session = foreign key here
    sequence_number INTEGER NOT NULL, -- not SERIAL as server will handle manually 
    event_type event_type NOT NULL ,
    actor_id UUID , --who triggers it interviewer or guest if null -> system events
    actor_role role NOT NULL,
    payload JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
    CONSTRAINT unique_session_sequence
        UNIQUE (session_id, sequence_number)
);

CREATE INDEX ON events(session_id, sequence_number);

-- multiple col in one index -> composite index makes the query faster as 
-- you'll search "get all events for session X ordered by sequence"