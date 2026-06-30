# Code Collab

Code Collab is a real-time collaborative code editor with an AI workspace. Users can join the same room, edit code together live, and ask an assistant to explain, debug, review, refactor, or generate tests for the active room code.

The app still keeps the room-sharing workflow simple, but the backend is now structured around services and repositories so it can run as a local demo or as a Postgres-backed app with RAG.

## Tech Stack

- React, TypeScript, Vite
- Monaco Editor
- Express and Socket.IO
- OpenAI Responses API and embeddings
- PostgreSQL with pgvector for persistence and semantic retrieval
- Vitest for backend tests

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
DATABASE_URL=postgres://postgres:postgres@localhost:5432/code_collab
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

## PostgreSQL + pgvector

Create a database with pgvector installed, then use the schema in:

```txt
backend/migrations/001_ai_enhanced_code_collab.sql
```

The backend also runs the same idempotent schema creation when `DATABASE_URL` is configured.

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
```

## Sharing a Room

After joining a room, use **Copy Link** to share a URL like:

```txt
http://localhost:5173/?room=demo-room
```

Opening that link pre-fills the room ID so another user can join quickly.

## Next Steps

- Add authentication and room permissions
- Replace whole-document sync with Yjs/y-monaco CRDT
- Add Socket.IO Redis adapter for multi-instance deployment
- Add code execution through Judge0 or a sandbox service
- Add uploaded project and GitHub repository RAG
- Add frontend component tests and Playwright multi-user e2e coverage
