export type AppConfig = {
  port: number;
  frontendOrigins: string[];
  serveFrontend: boolean;
  databaseUrl?: string;
  databaseSsl: boolean;
  aiProvider: "openai" | "gemini";
  openAiApiKey?: string;
  openAiModel: string;
  openAiEmbeddingModel: string;
  geminiApiKey?: string;
  geminiModel: string;
  geminiEmbeddingModel: string;
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

function readOptionalBoolean(name: string): boolean | undefined {
  const rawValue = process.env[name];

  if (!rawValue) {
    return undefined;
  }

  return ["1", "true", "yes", "on"].includes(rawValue.toLowerCase());
}

function readBoolean(name: string, fallback: boolean): boolean {
  return readOptionalBoolean(name) ?? fallback;
}

function readCsv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function readAiProvider(): AppConfig["aiProvider"] {
  return process.env.AI_PROVIDER?.toLowerCase() === "gemini" ? "gemini" : "openai";
}

function readFrontendOrigins(): string[] {
  const appHost = process.env.APP_HOST ?? process.env.RENDER_EXTERNAL_HOSTNAME;
  const renderOrigin = appHost ? `https://${appHost}` : "";

  return Array.from(
    new Set([
      ...readCsv("FRONTEND_ORIGIN"),
      "http://localhost:5173",
      "http://localhost:4173",
      renderOrigin
    ].filter(Boolean))
  );
}

function inferDatabaseSsl(databaseUrl: string | undefined): boolean {
  const explicitValue = readOptionalBoolean("DATABASE_SSL");

  if (explicitValue !== undefined) {
    return explicitValue;
  }

  if (!databaseUrl) {
    return false;
  }

  if (databaseUrl.includes("sslmode=require")) {
    return true;
  }

  try {
    const host = new URL(databaseUrl).hostname;
    return !["localhost", "127.0.0.1", "::1"].includes(host) && !host.endsWith(".internal");
  } catch {
    return false;
  }
}

export function readConfig(): AppConfig {
  const databaseUrl = process.env.DATABASE_URL;

  return {
    port: readInteger("PORT", 8000),
    frontendOrigins: readFrontendOrigins(),
    serveFrontend: readBoolean("SERVE_FRONTEND", process.env.NODE_ENV === "production"),
    databaseUrl,
    databaseSsl: inferDatabaseSsl(databaseUrl),
    aiProvider: readAiProvider(),
    openAiApiKey: process.env.OPENAI_API_KEY,
    openAiModel: process.env.OPENAI_MODEL ?? "gpt-5.5",
    openAiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
    geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-2",
    aiMaxInputChars: readInteger("AI_MAX_INPUT_CHARS", 24000),
    aiRateLimitPerRoom: readInteger("AI_RATE_LIMIT_PER_ROOM", 12),
    aiRateLimitWindowMs: readInteger("AI_RATE_LIMIT_WINDOW_MS", 60000),
    codeIndexDebounceMs: readInteger("CODE_INDEX_DEBOUNCE_MS", 900)
  };
}
