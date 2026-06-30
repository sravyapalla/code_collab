import { AiMessage, AiUsageLog, CodeChunk, RoomState } from "../types.js";
import { defaultCode, defaultLanguage, RoomRepository } from "./roomRepository.js";

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function keywordScore(query: string, content: string): number {
  const terms = query
    .toLowerCase()
    .split(/\W+/)
    .filter((term) => term.length > 2);

  if (terms.length === 0) {
    return 0;
  }

  const lowerContent = content.toLowerCase();
  const hits = terms.filter((term) => lowerContent.includes(term)).length;
  return hits / terms.length;
}

export class MemoryRoomRepository implements RoomRepository {
  private readonly rooms = new Map<string, RoomState>();
  private readonly aiMessages = new Map<string, AiMessage[]>();
  private readonly chunks = new Map<string, CodeChunk[]>();
  private readonly usageLogs: AiUsageLog[] = [];

  async init(): Promise<void> {
    return undefined;
  }

  async close(): Promise<void> {
    return undefined;
  }

  async getOrCreateRoom(roomId: string): Promise<RoomState> {
    const existingRoom = this.rooms.get(roomId);

    if (existingRoom) {
      return existingRoom;
    }

    const now = new Date();
    const room = {
      roomId,
      code: defaultCode,
      language: defaultLanguage,
      createdAt: now,
      updatedAt: now
    };

    this.rooms.set(roomId, room);
    return room;
  }

  async updateRoomCode(roomId: string, code: string): Promise<RoomState> {
    const room = await this.getOrCreateRoom(roomId);
    const updatedRoom = {
      ...room,
      code,
      updatedAt: new Date()
    };

    this.rooms.set(roomId, updatedRoom);
    return updatedRoom;
  }

  async updateRoomLanguage(roomId: string, language: string): Promise<RoomState> {
    const room = await this.getOrCreateRoom(roomId);
    const updatedRoom = {
      ...room,
      language,
      updatedAt: new Date()
    };

    this.rooms.set(roomId, updatedRoom);
    return updatedRoom;
  }

  async saveRoomSnapshot(_room: RoomState): Promise<void> {
    return undefined;
  }

  async listAiMessages(roomId: string): Promise<AiMessage[]> {
    return [...(this.aiMessages.get(roomId) ?? [])];
  }

  async saveAiMessage(message: AiMessage): Promise<void> {
    const messages = this.aiMessages.get(message.roomId) ?? [];
    messages.push(message);
    this.aiMessages.set(message.roomId, messages);
  }

  async recordAiUsage(usage: AiUsageLog): Promise<void> {
    this.usageLogs.push(usage);
  }

  async getCodeChunks(roomId: string): Promise<CodeChunk[]> {
    return [...(this.chunks.get(roomId) ?? [])];
  }

  async upsertCodeChunks(roomId: string, chunks: CodeChunk[]): Promise<void> {
    const chunksById = new Map((this.chunks.get(roomId) ?? []).map((chunk) => [chunk.id, chunk]));

    for (const chunk of chunks) {
      chunksById.set(chunk.id, chunk);
    }

    this.chunks.set(roomId, [...chunksById.values()]);
  }

  async deleteCodeChunksNotIn(roomId: string, chunkIds: string[]): Promise<void> {
    const allowedIds = new Set(chunkIds);
    const nextChunks = (this.chunks.get(roomId) ?? []).filter((chunk) => allowedIds.has(chunk.id));
    this.chunks.set(roomId, nextChunks);
  }

  async searchCodeChunks(roomId: string, query: string, embedding: number[] | undefined, limit: number): Promise<CodeChunk[]> {
    const chunks = this.chunks.get(roomId) ?? [];

    return chunks
      .map((chunk) => {
        const vectorScore = embedding && chunk.embedding ? cosineSimilarity(embedding, chunk.embedding) : 0;
        const textScore = keywordScore(query, chunk.content);
        return {
          chunk,
          score: Math.max(vectorScore, textScore)
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map(({ chunk }) => chunk);
  }
}

