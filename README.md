# Code Collab

Code Collab is a real-time collaborative code editor with an AI workspace. Users can join the same room, edit code together live, and ask an assistant to explain, debug, review, refactor, or generate tests for the active room code.

The app still keeps the room-sharing workflow simple, but the backend is now structured around services and repositories so it can run as a local demo or as a Postgres-backed app with RAG.

## Live Deployment

Live app:

```txt
https://code-collab-w0dg.onrender.com
```

Health check:

```txt
https://code-collab-w0dg.onrender.com/health
```

Current deployed health response:

```json
{
  "status": "ok",
  "storage": "postgres",
  "ai": "openai"
}
```

The production deployment runs the React/Vite frontend and Express/Socket.IO backend together on one Render web service. Render PostgreSQL stores room state, AI messages, and pgvector embeddings for RAG-based room-code retrieval.

## Tech Stack

- React, TypeScript, Vite
- Monaco Editor
- Express and Socket.IO
- OpenAI Responses API and embeddings
- PostgreSQL with pgvector for persistence and semantic retrieval
- Vitest for backend tests
- Playwright for multi-user end-to-end tests
- Render for full-stack deployment and managed PostgreSQL

## Features

- Create or join a room by room ID
- Edit code in a Monaco editor
- Sync code and language changes live between users
- Show connected users
- Copy the active room ID or shareable room link
- Remember last name, room, and language in the browser
- Persist room state through a repository layer
- Index active room code into line-aware chunks
- Ask a streamed AI assistant with modes for Ask, Explain, Debug, Review, Tests, and Refactor
- Show RAG citations from retrieved room chunks
- Preview AI code suggestions and insert them into the editor

## Project Structure

```txt
code-collab/
+-- backend/
|   +-- migrations/      # PostgreSQL + pgvector schema
|   +-- src/
|   |   +-- repositories/ # memory and Postgres storage
|   |   +-- routes/       # HTTP/SSE routes
|   |   +-- services/     # rooms, retrieval, AI provider, AI orchestration
|   |   +-- socket/       # Socket.IO room events
|   +-- test/             # backend Vitest coverage
+-- frontend/
|   +-- src/              # React app and styles
+-- .github/workflows/ci.yml
+-- package.json
+-- render.yaml           # Render web service + PostgreSQL Blueprint
```

## Local Setup

Install dependencies:

```bash
npm install
```

Start the backend:

```bash
npm run dev:backend
```

Start the frontend in another terminal:

```bash
npm run dev:frontend
```

Open:

```txt
http://localhost:5173
```

## Environment Variables

Backend:

```txt
PORT=8000
FRONTEND_ORIGIN=http://localhost:5173
SERVE_FRONTEND=false
DATABASE_URL=postgres://postgres:postgres@localhost:5432/code_collab
DATABASE_SSL=false
APP_HOST=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.5
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
AI_MAX_INPUT_CHARS=24000
AI_RATE_LIMIT_PER_ROOM=12
AI_RATE_LIMIT_WINDOW_MS=60000
CODE_INDEX_DEBOUNCE_MS=900
```

Frontend:

```txt
VITE_BACKEND_URL=http://localhost:8000
```

If `DATABASE_URL` is omitted, the backend uses an in-memory repository. If `OPENAI_API_KEY` is omitted, the AI panel still streams a setup message but embeddings and model answers are disabled.

To change the AI key locally, edit `backend/.env`, set `OPENAI_API_KEY=sk-...`, and restart `npm run dev:backend`. To change the deployed app key, update `OPENAI_API_KEY` in the Render `code-collab` service environment and restart or redeploy the service. A `429` quota/billing error means the configured key's OpenAI project or organization needs active quota/billing, or a different key with available quota.

## PostgreSQL + pgvector

Create a database with pgvector installed, then use the schema in:

```txt
backend/migrations/001_ai_enhanced_code_collab.sql
```

The backend also runs the same idempotent schema creation when `DATABASE_URL` is configured.

## Deployment

This project is deployed on Render as a single full-stack service. The Express backend serves the built Vite frontend when `SERVE_FRONTEND=true`, so Socket.IO, REST API, SSE AI streaming, and the frontend all run from the same production origin.

1. Push the repo to GitHub.
2. In Render, create a new Blueprint from this repository. Render will use `render.yaml`.
3. The Blueprint creates:

```txt
code-collab     # Node web service
code-collab-db  # PostgreSQL database
```

4. Set this secret environment variable when prompted:

```txt
OPENAI_API_KEY=your_openai_api_key
```

5. Keep these configured from `render.yaml`:

```txt
SERVE_FRONTEND=true
DATABASE_URL=auto-filled from code-collab-db
DATABASE_SSL=false
OPENAI_MODEL=gpt-5.5
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

6. After deployment, open:

```txt
https://your-render-service.onrender.com/health
```

The health response should show `storage: "postgres"` because the Blueprint wires `DATABASE_URL` from `code-collab-db`, and `ai: "openai"` when `OPENAI_API_KEY` is set.

This deployment is currently live at:

```txt
https://code-collab-w0dg.onrender.com
```

The backend creates the pgvector extension on startup with:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

If you use an external hosted database instead of the Blueprint database, use a Postgres provider that supports pgvector, such as Supabase, Neon, or Render Postgres. For SSL-required providers, either append `?sslmode=require` to the connection string or set:

```txt
DATABASE_SSL=true
```

If `DATABASE_URL` is omitted, the app still deploys with in-memory rooms, but room persistence and RAG citations will reset on restart.

## AI/RAG Flow

1. Room code changes are saved through the room service.
2. The retrieval service debounces indexing.
3. Code is chunked by line ranges, hashed, embedded only when changed, and stored as `code_chunks`.
4. AI requests retrieve relevant chunks with vector search and text search fallback.
5. The assistant streams through `POST /api/rooms/:roomId/ai/stream`.
6. User and assistant messages are stored and returned by `GET /api/rooms/:roomId/ai/messages`.

## Scripts

```bash
npm run dev:backend
npm run dev:frontend
npm test
npm run build
npm run test:e2e
```

## Sharing a Room

After joining a room, use **Copy Link** to share a URL like:

```txt
http://localhost:5173/?room=demo-room
```

In production, the same flow works with the deployed URL:

```txt
https://code-collab-w0dg.onrender.com/?room=demo-room
```

Opening either link pre-fills the room ID so another user can join quickly.

## Next Steps

- Add authentication and room permissions
- Replace whole-document sync with Yjs/y-monaco CRDT
- Add Socket.IO Redis adapter for multi-instance deployment
- Add code execution through Judge0 or a sandbox service
- Add uploaded project and GitHub repository RAG
- Add frontend component tests and Playwright multi-user e2e coverage
