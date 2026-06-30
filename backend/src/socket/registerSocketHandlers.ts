import { Server } from "socket.io";
import { RoomService } from "../services/roomService.js";
import { RetrievalService } from "../services/retrievalService.js";
import { isJoinRoomPayload, isRecord } from "../utils/validation.js";

export function registerSocketHandlers(io: Server, roomService: RoomService, retrievalService: RetrievalService): void {
  const usersByRoom = new Map<string, Map<string, string>>();

  function getRoomUsers(roomId: string): string[] {
    return Array.from(usersByRoom.get(roomId)?.values() ?? []);
  }

  function broadcastUsers(roomId: string): void {
    io.to(roomId).emit("users-changed", getRoomUsers(roomId));
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
    socket.on("join-room", async (payload: unknown) => {
      try {
        if (!isJoinRoomPayload(payload)) {
          socket.emit("error-message", "Room ID and name are required.");
          return;
        }

        const cleanRoomId = payload.roomId.trim();
        const cleanUserName = payload.userName.trim() || "Guest";

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

        const room = await roomService.getOrCreateRoom(cleanRoomId);
        const roomUsers = usersByRoom.get(cleanRoomId) ?? new Map<string, string>();
        roomUsers.set(socket.id, cleanUserName);
        usersByRoom.set(cleanRoomId, roomUsers);
        retrievalService.scheduleIndex(room);

        socket.emit("room-state", {
          code: room.code,
          language: room.language,
          users: getRoomUsers(cleanRoomId)
        });

        broadcastUsers(cleanRoomId);
      } catch (error) {
        socket.emit("error-message", error instanceof Error ? error.message : "Could not join room.");
      }
    });

    socket.on("code-change", async (payload: unknown) => {
      try {
        if (!isRecord(payload) || typeof payload.roomId !== "string" || typeof payload.code !== "string") {
          socket.emit("error-message", "Code update is invalid.");
          return;
        }

        const room = await roomService.updateCode(payload.roomId, payload.code);
        retrievalService.scheduleIndex(room);
        socket.to(payload.roomId).emit("code-change", payload.code);
      } catch (error) {
        socket.emit("error-message", error instanceof Error ? error.message : "Could not save code update.");
      }
    });

    socket.on("language-change", async (payload: unknown) => {
      try {
        if (!isRecord(payload) || typeof payload.roomId !== "string" || typeof payload.language !== "string") {
          socket.emit("error-message", "Language update is invalid.");
          return;
        }

        const room = await roomService.updateLanguage(payload.roomId, payload.language);
        retrievalService.scheduleIndex(room);
        socket.to(payload.roomId).emit("language-change", payload.language);
      } catch (error) {
        socket.emit("error-message", error instanceof Error ? error.message : "Could not save language update.");
      }
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
}

