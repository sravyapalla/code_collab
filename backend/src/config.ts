export type AppConfig = {
  port: number;
  frontendOrigin: string;
  databaseUrl?: string;
  openAiApiKey?: string;
  openAiModel: string;
  openAiEmbeddingModel: string;
  aiMaxInputChars: number;
  aiRateLimitPerRoom: number;
  aiRateLimitWindowMs: number;
  codeIndexDebounceMs: number;
};

function readInteger(name: string, fallback: number): number {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

export function readConfig(): AppConfig {
  return {
    port: readInteger("PORT", 8000),
    frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
    databaseUrl: process.env.DATABASE_URL,
    openAiApiKey: process.env.OPENAI_API_KEY,
    openAiModel: process.env.OPENAI_MODEL ?? "gpt-5.5",
    openAiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    aiMaxInputChars: readInteger("AI_MAX_INPUT_CHARS", 24000),
    aiRateLimitPerRoom: readInteger("AI_RATE_LIMIT_PER_ROOM", 12),
    aiRateLimitWindowMs: readInteger("AI_RATE_LIMIT_WINDOW_MS", 60000),
    codeIndexDebounceMs: readInteger("CODE_INDEX_DEBOUNCE_MS", 900)
  };
}

