
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users(
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- for dev purpose
INSERT INTO users(email,password)
VALUES
    ('lalit@gmail.com', 'hgab-3')
;
