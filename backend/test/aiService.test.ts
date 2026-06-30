import { describe, expect, it } from "vitest";
import { AppConfig } from "../src/config.js";
import { MemoryRoomRepository } from "../src/repositories/memoryRoomRepository.js";
import { AiProvider, AiResponseInput } from "../src/services/aiProvider.js";
import { AiService } from "../src/services/aiService.js";
import { RetrievalService } from "../src/services/retrievalService.js";
import { RoomService } from "../src/services/roomService.js";

class MockAiProvider implements AiProvider {
  readonly providerName = "mock";
  readonly model = "mock-model";
  readonly isConfigured = true;

  async embedTexts(texts: string[]): Promise<number[][]> {
    return texts.map((text) => [text.length, text.includes("sum") ? 1 : 0, 1]);
  }

  async *streamResponse(input: AiResponseInput): AsyncGenerator<string> {
    expect(input.systemPrompt).toContain("Code Collab AI");
    expect(input.userPrompt).toContain("User request:");
    yield "Use ";
    yield "the sum helper.";
  }
}

const testConfig: AppConfig = {
  port: 8000,
  frontendOrigin: "http://localhost:5173",
  openAiModel: "gpt-5.5",
  openAiEmbeddingModel: "text-embedding-3-small",
  aiMaxInputChars: 24000,
  aiRateLimitPerRoom: 12,
  aiRateLimitWindowMs: 60000,
  codeIndexDebounceMs: 1
};

describe("AiService", () => {
  it("streams and stores grounded AI messages", async () => {
    const repository = new MemoryRoomRepository();
    const aiProvider = new MockAiProvider();
    const roomService = new RoomService(repository);
    const retrievalService = new RetrievalService(repository, aiProvider, testConfig);
    const aiService = new AiService(repository, roomService, retrievalService, aiProvider, testConfig);

    await roomService.updateCode("demo-room", "function sum(a, b) {\n  return a + b;\n}");

    const result = await aiService.createStream("demo-room", {
      mode: "ask",
      message: "How does sum work?",
      userName: "Sravya"
    });

    let streamedContent = "";

    for await (const delta of result.stream) {
      streamedContent += delta;
    }

    expect(streamedContent).toBe("Use the sum helper.");

    const messages = await aiService.listMessages("demo-room");
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toBe("Use the sum helper.");
    expect(messages[1].citations[0].startLine).toBe(1);
  });
});

