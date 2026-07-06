import { describe, expect, it } from "vitest";
import { formatAiError } from "../src/utils/aiErrors.js";

describe("formatAiError", () => {
  it("turns OpenAI quota errors into a setup-focused message", () => {
    const message = formatAiError({
      status: 429,
      error: {
        code: "insufficient_quota",
        message: "You exceeded your current quota, please check your plan and billing details."
      }
    });

    expect(message).toContain("OpenAI quota is exhausted");
    expect(message).toContain("OPENAI_API_KEY");
    expect(message).not.toContain("You exceeded your current quota");
  });

  it("turns invalid key errors into a setup-focused message", () => {
    expect(formatAiError({ status: 401, code: "invalid_api_key" })).toContain("OpenAI rejected");
  });

  it("keeps unrelated errors intact", () => {
    expect(formatAiError(new Error("Room not found."))).toBe("Room not found.");
  });
});
