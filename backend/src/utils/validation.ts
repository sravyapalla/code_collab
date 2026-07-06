import { AiMode, AiStreamRequest, GithubPushRequest, JoinRoomPayload } from "../types.js";

const aiModes = new Set<AiMode>(["ask", "explain", "debug", "review", "tests", "refactor"]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isJoinRoomPayload(value: unknown): value is JoinRoomPayload {
  return (
    isRecord(value) &&
    typeof value.roomId === "string" &&
    typeof value.userName === "string"
  );
}

export function parseAiStreamRequest(value: unknown): AiStreamRequest | null {
  if (!isRecord(value) || typeof value.message !== "string") {
    return null;
  }

  const rawMode = typeof value.mode === "string" ? value.mode : "ask";
  const mode = aiModes.has(rawMode as AiMode) ? (rawMode as AiMode) : "ask";
  const selection = typeof value.selection === "string" ? value.selection : undefined;
  const userName = typeof value.userName === "string" ? value.userName : undefined;

  return {
    message: value.message,
    mode,
    selection,
    userName
  };
}

function readTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseGithubPushRequest(value: unknown): GithubPushRequest | null {
  if (!isRecord(value)) {
    return null;
  }

  const token = readTrimmedString(value.token);
  const owner = readTrimmedString(value.owner);
  const repo = readTrimmedString(value.repo);
  const branch = readTrimmedString(value.branch) ?? "main";
  const path = readTrimmedString(value.path);
  const message = readTrimmedString(value.message) ?? "Update code from Code Collab";
  const content = typeof value.content === "string" ? value.content : null;

  if (!token || !owner || !repo || !path || content === null) {
    return null;
  }

  if (content.length > 750000 || path.startsWith("/") || path.includes("..")) {
    return null;
  }

  return {
    token,
    owner,
    repo,
    branch,
    path,
    message,
    content
  };
}
