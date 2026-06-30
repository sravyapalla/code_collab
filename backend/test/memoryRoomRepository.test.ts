import { describe, expect, it } from "vitest";
import { MemoryRoomRepository } from "../src/repositories/memoryRoomRepository.js";

describe("MemoryRoomRepository", () => {
  it("persists room state in memory", async () => {
    const repository = new MemoryRoomRepository();
    const room = await repository.getOrCreateRoom("demo-room");

    expect(room.roomId).toBe("demo-room");
    expect(room.language).toBe("javascript");

    await repository.updateRoomCode("demo-room", "console.log('saved');");
    await repository.updateRoomLanguage("demo-room", "typescript");

    const updatedRoom = await repository.getOrCreateRoom("demo-room");
    expect(updatedRoom.code).toBe("console.log('saved');");
    expect(updatedRoom.language).toBe("typescript");
  });

  it("stores AI messages by room", async () => {
    const repository = new MemoryRoomRepository();
    const createdAt = new Date();

    await repository.saveAiMessage({
      id: "message-1",
      roomId: "demo-room",
      role: "assistant",
      mode: "ask",
      content: "Hello",
      citations: [],
      createdAt
    });

    expect(await repository.listAiMessages("demo-room")).toEqual([
      {
        id: "message-1",
        roomId: "demo-room",
        role: "assistant",
        mode: "ask",
        content: "Hello",
        citations: [],
        createdAt
      }
    ]);
    expect(await repository.listAiMessages("other-room")).toEqual([]);
  });
});

