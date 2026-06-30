import { Pool } from "pg";
import { AiMessage, AiUsageLog, CodeChunk, RoomState } from "../types.js";
import { defaultCode, defaultLanguage, RoomRepository } from "./roomRepository.js";

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

function mapRoom(row: Record<string, unknown>): RoomState {
  return {
    roomId: String(row.room_id),
    code: String(row.code),
    language: String(row.language),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at))
  };
}

function mapAiMessage(row: Record<string, unknown>): AiMessage {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    role: row.role === "assistant" ? "assistant" : "user",
    mode: String(row.mode) as AiMessage["mode"],
    content: String(row.content),
    citations: Array.isArray(row.citations) ? row.citations : [],
    userName: row.user_name ? String(row.user_name) : undefined,
    createdAt: new Date(String(row.created_at))
  };
}

function mapChunk(row: Record<string, unknown>): CodeChunk {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    chunkHash: String(row.chunk_hash),
    language: String(row.language),
    startLine: Number(row.start_line),
    endLine: Number(row.end_line),
    content: String(row.content)
  };
}

export class PostgresRoomRepository implements RoomRepository {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl
    });
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE EXTENSION IF NOT EXISTS vector;

      CREATE TABLE IF NOT EXISTS rooms (
        room_id text PRIMARY KEY,
        code text NOT NULL,
        language text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS room_snapshots (
        id bigserial PRIMARY KEY,
        room_id text NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
        code text NOT NULL,
        language text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS room_messages (
        id text PRIMARY KEY,
        room_id text NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
        user_name text NOT NULL,
        content text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS ai_messages (
        id text PRIMARY KEY,
        room_id text NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
        role text NOT NULL CHECK (role IN ('user', 'assistant')),
        mode text NOT NULL,
        content text NOT NULL,
        citations jsonb NOT NULL DEFAULT '[]'::jsonb,
        user_name text,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS ai_usage_logs (
        id bigserial PRIMARY KEY,
        room_id text NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
        provider text NOT NULL,
        model text NOT NULL,
        prompt_tokens integer,
        completion_tokens integer,
        total_tokens integer,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS code_chunks (
        id text PRIMARY KEY,
        room_id text NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
        chunk_hash text NOT NULL,
        language text NOT NULL,
        start_line integer NOT NULL,
        end_line integer NOT NULL,
        content text NOT NULL,
        embedding vector(1536),
        textsearch tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS room_snapshots_room_created_idx ON room_snapshots(room_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS ai_messages_room_created_idx ON ai_messages(room_id, created_at ASC);
      CREATE INDEX IF NOT EXISTS code_chunks_room_hash_idx ON code_chunks(room_id, chunk_hash);
      CREATE INDEX IF NOT EXISTS code_chunks_textsearch_idx ON code_chunks USING gin(textsearch);
      CREATE INDEX IF NOT EXISTS code_chunks_embedding_hnsw_idx ON code_chunks USING hnsw (embedding vector_cosine_ops);
    `);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getOrCreateRoom(roomId: string): Promise<RoomState> {
    const result = await this.pool.query(
      `
        INSERT INTO rooms (room_id, code, language)
        VALUES ($1, $2, $3)
        ON CONFLICT (room_id) DO UPDATE SET room_id = EXCLUDED.room_id
        RETURNING *
      `,
      [roomId, defaultCode, defaultLanguage]
    );

    return mapRoom(result.rows[0]);
  }

  async updateRoomCode(roomId: string, code: string): Promise<RoomState> {
    await this.getOrCreateRoom(roomId);
    const result = await this.pool.query(
      `
        UPDATE rooms
        SET code = $2, updated_at = now()
        WHERE room_id = $1
        RETURNING *
      `,
      [roomId, code]
    );

    return mapRoom(result.rows[0]);
  }

  async updateRoomLanguage(roomId: string, language: string): Promise<RoomState> {
    await this.getOrCreateRoom(roomId);
    const result = await this.pool.query(
      `
        UPDATE rooms
        SET language = $2, updated_at = now()
        WHERE room_id = $1
        RETURNING *
      `,
      [roomId, language]
    );

    return mapRoom(result.rows[0]);
  }

  async saveRoomSnapshot(room: RoomState): Promise<void> {
    await this.pool.query(
      "INSERT INTO room_snapshots (room_id, code, language) VALUES ($1, $2, $3)",
      [room.roomId, room.code, room.language]
    );
  }

  async listAiMessages(roomId: string): Promise<AiMessage[]> {
    const result = await this.pool.query(
      "SELECT * FROM ai_messages WHERE room_id = $1 ORDER BY created_at ASC LIMIT 100",
      [roomId]
    );

    return result.rows.map(mapAiMessage);
  }

  async saveAiMessage(message: AiMessage): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO ai_messages (id, room_id, role, mode, content, citations, user_name, created_at)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
      `,
      [
        message.id,
        message.roomId,
        message.role,
        message.mode,
        message.content,
        JSON.stringify(message.citations),
        message.userName ?? null,
        message.createdAt
      ]
    );
  }

  async recordAiUsage(usage: AiUsageLog): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO ai_usage_logs (room_id, provider, model, prompt_tokens, completion_tokens, total_tokens)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        usage.roomId,
        usage.provider,
        usage.model,
        usage.promptTokens ?? null,
        usage.completionTokens ?? null,
        usage.totalTokens ?? null
      ]
    );
  }

  async getCodeChunks(roomId: string): Promise<CodeChunk[]> {
    const result = await this.pool.query(
      "SELECT id, room_id, chunk_hash, language, start_line, end_line, content FROM code_chunks WHERE room_id = $1",
      [roomId]
    );

    return result.rows.map(mapChunk);
  }

  async upsertCodeChunks(_roomId: string, chunks: CodeChunk[]): Promise<void> {
    for (const chunk of chunks) {
      await this.pool.query(
        `
          INSERT INTO code_chunks (id, room_id, chunk_hash, language, start_line, end_line, content, embedding)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)
          ON CONFLICT (id) DO UPDATE SET
            chunk_hash = EXCLUDED.chunk_hash,
            language = EXCLUDED.language,
            start_line = EXCLUDED.start_line,
            end_line = EXCLUDED.end_line,
            content = EXCLUDED.content,
            embedding = EXCLUDED.embedding,
            updated_at = now()
        `,
        [
          chunk.id,
          chunk.roomId,
          chunk.chunkHash,
          chunk.language,
          chunk.startLine,
          chunk.endLine,
          chunk.content,
          chunk.embedding ? toVectorLiteral(chunk.embedding) : null
        ]
      );
    }
  }

  async deleteCodeChunksNotIn(roomId: string, chunkIds: string[]): Promise<void> {
    if (chunkIds.length === 0) {
      await this.pool.query("DELETE FROM code_chunks WHERE room_id = $1", [roomId]);
      return;
    }

    await this.pool.query("DELETE FROM code_chunks WHERE room_id = $1 AND NOT (id = ANY($2::text[]))", [
      roomId,
      chunkIds
    ]);
  }

  async searchCodeChunks(roomId: string, query: string, embedding: number[] | undefined, limit: number): Promise<CodeChunk[]> {
    const chunksById = new Map<string, CodeChunk>();

    if (embedding) {
      const vectorResult = await this.pool.query(
        `
          SELECT id, room_id, chunk_hash, language, start_line, end_line, content
          FROM code_chunks
          WHERE room_id = $1 AND embedding IS NOT NULL
          ORDER BY embedding <=> $2::vector
          LIMIT $3
        `,
        [roomId, toVectorLiteral(embedding), limit]
      );

      for (const row of vectorResult.rows) {
        const chunk = mapChunk(row);
        chunksById.set(chunk.id, chunk);
      }
    }

    if (chunksById.size < limit && query.trim()) {
      const textResult = await this.pool.query(
        `
          SELECT id, room_id, chunk_hash, language, start_line, end_line, content
          FROM code_chunks, plainto_tsquery('simple', $2) query
          WHERE room_id = $1 AND textsearch @@ query
          ORDER BY ts_rank_cd(textsearch, query) DESC
          LIMIT $3
        `,
        [roomId, query, limit]
      );

      for (const row of textResult.rows) {
        const chunk = mapChunk(row);
        chunksById.set(chunk.id, chunk);
      }
    }

    return [...chunksById.values()].slice(0, limit);
  }
}

