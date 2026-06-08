# Code Collab

Code Collab is a small real-time collaborative code editor. Users can join the same room and edit code together live.

This version intentionally keeps the stack small so the core collaboration flow is easy to understand before adding authentication, persistence, AI, code execution, Redis, or deployment features.

## Tech Stack

- React
- TypeScript
- Vite
- Monaco Editor
- Express
- Socket.IO

## Project Structure

```txt
code-collab/
+-- backend/     # Express + Socket.IO server
+-- frontend/    # React + Vite editor UI
+-- README.md
+-- .gitignore
```

## Features

- Create or join a room by room ID
- Edit code in a Monaco editor
- Sync code changes live between users in the same room
- Show connected users
- Change language mode for the editor
- Generate a room ID
- Copy the active room ID
- Copy a shareable room link
- Open a shared room link with `?room=room-id`
- Remember your last name, room, and language in the browser

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

## Sharing a Room

After joining a room, use **Copy Link** to share a URL like:

```txt
http://localhost:5173/?room=demo-room
```

Opening that link pre-fills the room ID so another user can join the same room quickly.

## Environment Variables

Backend:

```txt
PORT=8000
FRONTEND_ORIGIN=http://localhost:5173
```

Frontend:

```txt
VITE_BACKEND_URL=http://localhost:8000
```

## Next Steps

- Add room persistence with a database
- Add user authentication
- Add code execution
- Add AI helper panel
- Replace basic sync with a CRDT-based collaboration engine
