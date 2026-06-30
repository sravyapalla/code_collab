import { AiMessage, AiUsageLog, CodeChunk, RoomState } from "../types.js";

export type RoomRepository = {
  init(): Promise<void>;
  close(): Promise<void>;
  getOrCreateRoom(roomId: string): Promise<RoomState>;
  updateRoomCode(roomId: string, code: string): Promise<RoomState>;
  updateRoomLanguage(roomId: string, language: string): Promise<RoomState>;
  saveRoomSnapshot(room: RoomState): Promise<void>;
  listAiMessages(roomId: string): Promise<AiMessage[]>;
  saveAiMessage(message: AiMessage): Promise<void>;
  recordAiUsage(usage: AiUsageLog): Promise<void>;
  getCodeChunks(roomId: string): Promise<CodeChunk[]>;
  upsertCodeChunks(roomId: string, chunks: CodeChunk[]): Promise<void>;
  deleteCodeChunksNotIn(roomId: string, chunkIds: string[]): Promise<void>;
  searchCodeChunks(roomId: string, query: string, embedding: number[] | undefined, limit: number): Promise<CodeChunk[]>;
};

export const defaultCode = "// Start coding together\nconsole.log('Hello from Code Collab');\n";
export const defaultLanguage = "javascript";

