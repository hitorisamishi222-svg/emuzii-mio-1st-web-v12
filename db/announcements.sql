-- Install only after verifying the dedicated gallery-admin database and backup.
-- Never run on the GAS/participant data source. Not executed by public requests.
CREATE TABLE IF NOT EXISTS anniversary_announcements (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 title TEXT NOT NULL CHECK(char_length(title) BETWEEN 1 AND 120),
 body TEXT NOT NULL CHECK(char_length(body) BETWEEN 1 AND 5000),
 published BOOLEAN NOT NULL DEFAULT FALSE,
 revision INTEGER NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_by TEXT
);
