import "dotenv/config";
import cors from "cors";
import express from "express";
import http from "node:http";
import { Server } from "socket.io";

type RoomState = {
  code: string;
  language: string;
};

type JoinRoomPayload = {
  roomId: string;
  userName: string;
};

const app = express();
const server = http.createServer(app);

const port = Number(process.env.PORT ?? 8000);
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";

const rooms = new Map<string, RoomState>();
const usersByRoom = new Map<string, Map<string, string>>();

app.use(cors({ origin: frontendOrigin }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const io = new Server(server, {
  cors: {
    origin: frontendOrigin,
    methods: ["GET", "POST"]
  }
});

function getRoom(roomId: string): RoomState {
  const existingRoom = rooms.get(roomId);

  if (existingRoom) {
    return existingRoom;
  }

  const newRoom = {
    code: "// Start coding together\nconsole.log('Hello from Code Collab');\n",
    language: "javascript"
  };

  rooms.set(roomId, newRoom);
  return newRoom;
}

function getRoomUsers(roomId: string): string[] {
  return Array.from(usersByRoom.get(roomId)?.values() ?? []);
}

function broadcastUsers(roomId: string): void {
  io.to(roomId).emit("users-changed", getRoomUsers(roomId));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isJoinRoomPayload(value: unknown): value is JoinRoomPayload {
  return (
    isRecord(value) &&
    typeof value.roomId === "string" &&
    typeof value.userName === "string"
  );
}

function cleanupSocketRoom(socketId: string, roomId: string | undefined): void {
  if (!roomId) {
    return;
  }

  const roomUsers = usersByRoom.get(roomId);
  roomUsers?.delete(socketId);

  if (!roomUsers || roomUsers.size === 0) {
    usersByRoom.delete(roomId);
    return;
  }

  broadcastUsers(roomId);
}

io.on("connection", (socket) => {
  socket.on("join-room", (payload: unknown) => {
    if (!isJoinRoomPayload(payload)) {
      socket.emit("error-message", "Room ID and name are required.");
      return;
    }

    const { roomId, userName } = payload;
    const cleanRoomId = roomId.trim();
    const cleanUserName = userName.trim() || "Guest";

    if (!cleanRoomId) {
      socket.emit("error-message", "Room ID is required.");
      return;
    }

    const previousRoomId = socket.data.roomId as string | undefined;

    if (previousRoomId && previousRoomId !== cleanRoomId) {
      socket.leave(previousRoomId);
      cleanupSocketRoom(socket.id, previousRoomId);
    }

    socket.join(cleanRoomId);
    socket.data.roomId = cleanRoomId;
    socket.data.userName = cleanUserName;

    const room = getRoom(cleanRoomId);
    const roomUsers = usersByRoom.get(cleanRoomId) ?? new Map<string, string>();
    roomUsers.set(socket.id, cleanUserName);
    usersByRoom.set(cleanRoomId, roomUsers);

    socket.emit("room-state", {
      code: room.code,
      language: room.language,
      users: getRoomUsers(cleanRoomId)
    });

    broadcastUsers(cleanRoomId);
  });

  socket.on("code-change", (payload: unknown) => {
    if (!isRecord(payload) || typeof payload.roomId !== "string" || typeof payload.code !== "string") {
      socket.emit("error-message", "Code update is invalid.");
      return;
    }

    const { roomId, code } = payload;
    const room = getRoom(roomId);
    room.code = code;
    socket.to(roomId).emit("code-change", code);
  });

  socket.on("language-change", (payload: unknown) => {
    if (!isRecord(payload) || typeof payload.roomId !== "string" || typeof payload.language !== "string") {
      socket.emit("error-message", "Language update is invalid.");
      return;
    }

    const { roomId, language } = payload;
    const room = getRoom(roomId);
    room.language = language;
    socket.to(roomId).emit("language-change", language);
  });

  socket.on("leave-room", () => {
    const roomId = socket.data.roomId as string | undefined;
    socket.leave(roomId ?? "");
    cleanupSocketRoom(socket.id, roomId);
    socket.data.roomId = undefined;
    socket.data.userName = undefined;
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId as string | undefined;
    cleanupSocketRoom(socket.id, roomId);
  });
});

server.listen(port, () => {
  console.log(`Code Collab backend running on http://localhost:${port}`);
});
