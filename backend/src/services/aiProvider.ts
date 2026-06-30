import OpenAI from "openai";
import { AppConfig } from "../config.js";

export type AiResponseInput = {
  systemPrompt: string;
  userPrompt: string;
};

export type AiProvider = {
  readonly providerName: string;
  readonly model: string;
  readonly isConfigured: boolean;
  embedTexts(texts: string[]): Promise<number[][]>;
  streamResponse(input: AiResponseInput): AsyncGenerator<string>;
};

export class DisabledAiProvider implements AiProvider {
  readonly providerName = "disabled";
  readonly model = "none";
  readonly isConfigured = false;

  async embedTexts(texts: string[]): Promise<number[][]> {
    return texts.map(() => []);
  }

  async *streamResponse(): AsyncGenerator<string> {
    yield "AI is not configured yet. Add OPENAI_API_KEY to the backend environment to enable grounded code help, embeddings, and streamed assistant responses.";
  }
}

export class OpenAiProvider implements AiProvider {
  readonly providerName = "openai";
  readonly model: string;
  readonly isConfigured = true;
  private readonly embeddingModel: string;
  private readonly client: OpenAI;

  constructor(config: AppConfig) {
    if (!config.openAiApiKey) {
      throw new Error("OpenAI API key is required for OpenAiProvider.");
    }

    this.model = config.openAiModel;
    this.embeddingModel = config.openAiEmbeddingModel;
    this.client = new OpenAI({
      apiKey: config.openAiApiKey
    });
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const response = await this.client.embeddings.create({
      model: this.embeddingModel,
      input: texts,
      encoding_format: "float"
    });

    return response.data
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);
  }

  async *streamResponse(input: AiResponseInput): AsyncGenerator<string> {
    const stream = await this.client.responses.create({
      model: this.model,
      input: [
        {
          role: "system",
          content: input.systemPrompt
        },
        {
          role: "user",
          content: input.userPrompt
        }
      ],
      reasoning: {
        effort: "low"
      },
      text: {
        verbosity: "medium"
      },
      stream: true
    });

    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        yield event.delta;
      }
    }
  }
}

export function createAiProvider(config: AppConfig): AiProvider {
  if (!config.openAiApiKey) {
    return new DisabledAiProvider();
  }

  return new OpenAiProvider(config);
}

