# Code Collab

Code Collab is a small real-time collaborative code editor. Users can join the same room and edit code together live.

This is the basic version of the project. It intentionally keeps the stack small so the core idea is easy to understand before adding authentication, persistence, AI, code execution, Redis, or deployment features.

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
├── backend/     # Express + Socket.IO server
├── frontend/    # React + Vite editor UI
├── README.md
└── .gitignore
```

## Features

- Create or join a room by room ID
- Edit code in a Monaco editor
- Sync code changes live between users in the same room
- Show connected users
- Change language mode for the editor

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
