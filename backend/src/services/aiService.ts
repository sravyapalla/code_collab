import { randomUUID } from "node:crypto";
import { AppConfig } from "../config.js";
import { RoomRepository } from "../repositories/roomRepository.js";
import { AiMessage, AiMode, AiStreamRequest } from "../types.js";
import { AiProvider } from "./aiProvider.js";
import { RetrievalService } from "./retrievalService.js";
import { RoomService } from "./roomService.js";

type AiStreamResult = {
  userMessage: AiMessage;
  assistantMessage: AiMessage;
  stream: AsyncGenerator<string>;
};

const modeInstructions: Record<AiMode, string> = {
  ask: "Answer the user's coding question directly and ground your answer in the provided room context.",
  explain: "Explain the selected or relevant code clearly. Prefer concise teaching language and mention important control flow.",
  debug: "Find likely bugs, edge cases, and failure modes. Suggest concrete fixes.",
  review: "Review the code for correctness, maintainability, security, and missing tests. Lead with findings.",
  tests: "Suggest useful tests and include example test code when practical.",
  refactor: "Suggest a focused refactor and include replacement code only when it is clearly helpful."
};

function clampText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n\n[Truncated to fit AI input budget]`;
}

function createAiMessage(params: Omit<AiMessage, "id" | "createdAt">): AiMessage {
  return {
    ...params,
    id: randomUUID(),
    createdAt: new Date()
  };
}

export class AiService {
  private readonly requestTimesByRoom = new Map<string, number[]>();

  constructor(
    private readonly repository: RoomRepository,
    private readonly roomService: RoomService,
    private readonly retrievalService: RetrievalService,
    private readonly aiProvider: AiProvider,
    private readonly config: AppConfig
  ) {}

  async listMessages(roomId: string): Promise<AiMessage[]> {
    await this.roomService.getOrCreateRoom(roomId);
    return this.repository.listAiMessages(roomId);
  }

  async reindexRoom(roomId: string): Promise<number> {
    const room = await this.roomService.getOrCreateRoom(roomId);
    return this.retrievalService.indexRoom(room);
  }

  async createStream(roomId: string, request: AiStreamRequest): Promise<AiStreamResult> {
    this.assertWithinRateLimit(roomId);

    const cleanMessage = request.message.trim();

    if (!cleanMessage) {
      throw new Error("Message is required.");
    }

    const room = await this.roomService.getOrCreateRoom(roomId);
    await this.retrievalService.indexRoom(room);

    const retrievalQuery = [cleanMessage, request.selection].filter(Boolean).join("\n\n");
    const citations = await this.retrievalService.search(roomId, retrievalQuery);
    const citationContext = await this.retrievalService.getCitationContext(roomId, citations);
    const selectedCode = request.selection?.trim()
      ? `Selected code:\n${request.selection.trim()}`
      : "No explicit editor selection was provided.";

    const systemPrompt = [
      "You are Code Collab AI, an assistant embedded in a real-time collaborative code editor.",
      "Use the room code context as your source of truth. If the provided context is insufficient, say what is missing.",
      "Keep suggestions practical for the currently selected language and avoid inventing files or APIs that are not in context.",
      "When you include code, use fenced code blocks and keep changes focused.",
      modeInstructions[request.mode]
    ].join("\n");

    const userPrompt = clampText(
      [
        `Room language: ${room.language}`,
        `User: ${request.userName?.trim() || "Guest"}`,
        `Mode: ${request.mode}`,
        selectedCode,
        `User request:\n${cleanMessage}`,
        `Retrieved room context:\n${citationContext || "No indexed context was found for this room."}`
      ].join("\n\n"),
      this.config.aiMaxInputChars
    );

    const userMessage = createAiMessage({
      roomId,
      role: "user",
      mode: request.mode,
      content: cleanMessage,
      citations: [],
      userName: request.userName
    });

    const assistantMessage = createAiMessage({
      roomId,
      role: "assistant",
      mode: request.mode,
      content: "",
      citations
    });

    await this.repository.saveAiMessage(userMessage);

    return {
      userMessage,
      assistantMessage,
      stream: this.createPersistedAssistantStream(assistantMessage, systemPrompt, userPrompt)
    };
  }

  private async *createPersistedAssistantStream(
    assistantMessage: AiMessage,
    systemPrompt: string,
    userPrompt: string
  ): AsyncGenerator<string> {
    let content = "";

    for await (const delta of this.aiProvider.streamResponse({ systemPrompt, userPrompt })) {
      content += delta;
      yield delta;
    }

    assistantMessage.content = content;
    await this.repository.saveAiMessage(assistantMessage);
    await this.repository.recordAiUsage({
      roomId: assistantMessage.roomId,
      provider: this.aiProvider.providerName,
      model: this.aiProvider.model
    });
  }

  private assertWithinRateLimit(roomId: string): void {
    const now = Date.now();
    const windowStart = now - this.config.aiRateLimitWindowMs;
    const recentTimes = (this.requestTimesByRoom.get(roomId) ?? []).filter((timestamp) => timestamp >= windowStart);

    if (recentTimes.length >= this.config.aiRateLimitPerRoom) {
      throw new Error("AI rate limit reached for this room. Try again in a moment.");
    }

    recentTimes.push(now);
    this.requestTimesByRoom.set(roomId, recentTimes);
  }
}

