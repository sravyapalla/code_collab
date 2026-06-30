CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS rooms (
  room_id text PRIMARY KEY,
  code text NOT NULL,
  language text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_snapshots (
  id bigserial PRIMARY KEY,
  room_id text NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  code text NOT NULL,
  language text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_messages (
  id text PRIMARY KEY,
  room_id text NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  user_name text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id text PRIMARY KEY,
  room_id text NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  mode text NOT NULL,
  content text NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  user_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id bigserial PRIMARY KEY,
  room_id text NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  provider text NOT NULL,
  model text NOT NULL,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS code_chunks (
  id text PRIMARY KEY,
  room_id text NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  chunk_hash text NOT NULL,
  language text NOT NULL,
  start_line integer NOT NULL,
  end_line integer NOT NULL,
  content text NOT NULL,
  embedding vector(1536),
  textsearch tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_snapshots_room_created_idx ON room_snapshots(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_messages_room_created_idx ON ai_messages(room_id, created_at ASC);
CREATE INDEX IF NOT EXISTS code_chunks_room_hash_idx ON code_chunks(room_id, chunk_hash);
CREATE INDEX IF NOT EXISTS code_chunks_textsearch_idx ON code_chunks USING gin(textsearch);
CREATE INDEX IF NOT EXISTS code_chunks_embedding_hnsw_idx ON code_chunks USING hnsw (embedding vector_cosine_ops);

