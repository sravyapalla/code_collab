import { createHash } from "node:crypto";
import { AppConfig } from "../config.js";
import { RoomRepository } from "../repositories/roomRepository.js";
import { AiCitation, CodeChunk, RoomState } from "../types.js";
import { AiProvider } from "./aiProvider.js";

type ChunkCandidate = Omit<CodeChunk, "embedding">;

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function createPreview(content: string): string {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(" ")
    .slice(0, 180);
}

export function buildCodeChunks(roomId: string, code: string, language: string): ChunkCandidate[] {
  const lines = code.split(/\r?\n/);
  const maxLinesPerChunk = 80;
  const overlapLines = 8;
  const chunks: ChunkCandidate[] = [];

  for (let startIndex = 0; startIndex < lines.length; startIndex += maxLinesPerChunk - overlapLines) {
    const chunkLines = lines.slice(startIndex, startIndex + maxLinesPerChunk);
    const content = chunkLines.join("\n").trim();

    if (!content) {
      continue;
    }

    const startLine = startIndex + 1;
    const endLine = startIndex + chunkLines.length;
    const chunkHash = hashValue(`${roomId}:${language}:${startLine}:${endLine}:${content}`);

    chunks.push({
      id: `chunk_${chunkHash.slice(0, 32)}`,
      roomId,
      chunkHash,
      language,
      startLine,
      endLine,
      content
    });

    if (startIndex + maxLinesPerChunk >= lines.length) {
      break;
    }
  }

  return chunks;
}

export class RetrievalService {
  private readonly pendingIndexes = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly repository: RoomRepository,
    private readonly aiProvider: AiProvider,
    private readonly config: AppConfig
  ) {}

  scheduleIndex(room: RoomState): void {
    const existingTimeout = this.pendingIndexes.get(room.roomId);

    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeout = setTimeout(() => {
      this.indexRoom(room).catch((error: unknown) => {
        console.error(`Failed to index room ${room.roomId}`, error);
      });
      this.pendingIndexes.delete(room.roomId);
    }, this.config.codeIndexDebounceMs);

    this.pendingIndexes.set(room.roomId, timeout);
  }

  async indexRoom(room: RoomState): Promise<number> {
    const nextChunks = buildCodeChunks(room.roomId, room.code, room.language);
    const existingChunks = await this.repository.getCodeChunks(room.roomId);
    const existingHashes = new Set(existingChunks.map((chunk) => chunk.chunkHash));
    const changedChunks = nextChunks.filter((chunk) => !existingHashes.has(chunk.chunkHash));
    const changedTexts = changedChunks.map((chunk) => chunk.content);
    const embeddings = this.aiProvider.isConfigured ? await this.aiProvider.embedTexts(changedTexts) : [];

    const chunksWithEmbeddings = changedChunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index]?.length ? embeddings[index] : undefined
    }));

    await this.repository.upsertCodeChunks(room.roomId, chunksWithEmbeddings);
    await this.repository.deleteCodeChunksNotIn(room.roomId, nextChunks.map((chunk) => chunk.id));

    return nextChunks.length;
  }

  async search(roomId: string, query: string, limit = 6): Promise<AiCitation[]> {
    const [queryEmbedding] = this.aiProvider.isConfigured ? await this.aiProvider.embedTexts([query]) : [undefined];
    const chunks = await this.repository.searchCodeChunks(roomId, query, queryEmbedding, limit);

    return chunks.map((chunk) => ({
      chunkId: chunk.id,
      language: chunk.language,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      preview: createPreview(chunk.content)
    }));
  }

  async getCitationContext(roomId: string, citations: AiCitation[]): Promise<string> {
    const chunks = await this.repository.getCodeChunks(roomId);
    const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));

    return citations
      .map((citation, index) => {
        const chunk = chunksById.get(citation.chunkId);

        if (!chunk) {
          return "";
        }

        return `Source ${index + 1}: ${chunk.language} lines ${chunk.startLine}-${chunk.endLine}\n${chunk.content}`;
      })
      .filter(Boolean)
      .join("\n\n");
  }
}

