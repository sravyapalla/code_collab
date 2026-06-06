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

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, userName }: JoinRoomPayload) => {
    const cleanRoomId = roomId.trim();
    const cleanUserName = userName.trim() || "Guest";

    if (!cleanRoomId) {
      socket.emit("error-message", "Room ID is required.");
      return;
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

  socket.on("code-change", ({ roomId, code }: { roomId: string; code: string }) => {
    const room = getRoom(roomId);
    room.code = code;
    socket.to(roomId).emit("code-change", code);
  });

  socket.on("language-change", ({ roomId, language }: { roomId: string; language: string }) => {
    const room = getRoom(roomId);
    room.language = language;
    socket.to(roomId).emit("language-change", language);
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId as string | undefined;

    if (!roomId) {
      return;
    }

    const roomUsers = usersByRoom.get(roomId);
    roomUsers?.delete(socket.id);

    if (roomUsers?.size === 0) {
      usersByRoom.delete(roomId);
      return;
    }

    broadcastUsers(roomId);
  });
});

server.listen(port, () => {
  console.log(`Code Collab backend running on http://localhost:${port}`);
});
