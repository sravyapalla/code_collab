import { AiMode, AiStreamRequest, JoinRoomPayload } from "../types.js";

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

