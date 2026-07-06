export type RoomState = {
  roomId: string;
  code: string;
  language: string;
  createdAt: Date;
  updatedAt: Date;
};

export type JoinRoomPayload = {
  roomId: string;
  userName: string;
};

export type AiMode = "ask" | "explain" | "debug" | "review" | "tests" | "refactor";

export type AiRole = "user" | "assistant";

export type AiCitation = {
  chunkId: string;
  language: string;
  startLine: number;
  endLine: number;
  preview: string;
  score?: number;
};

export type AiMessage = {
  id: string;
  roomId: string;
  role: AiRole;
  mode: AiMode;
  content: string;
  citations: AiCitation[];
  userName?: string;
  createdAt: Date;
};

export type CodeChunk = {
  id: string;
  roomId: string;
  chunkHash: string;
  language: string;
  startLine: number;
  endLine: number;
  content: string;
  embedding?: number[];
};

export type AiStreamRequest = {
  message: string;
  mode: AiMode;
  selection?: string;
  userName?: string;
};

export type AiUsageLog = {
  roomId: string;
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type GithubPushRequest = {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
  message: string;
  content: string;
};

export type GithubPushResult = {
  path: string;
  branch: string;
  htmlUrl: string;
  commitSha: string;
};
