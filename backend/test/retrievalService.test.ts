import { describe, expect, it } from "vitest";
import { buildCodeChunks } from "../src/services/retrievalService.js";

describe("buildCodeChunks", () => {
  it("creates line-aware chunks with stable ids", () => {
    const code = Array.from({ length: 95 }, (_, index) => `console.log(${index});`).join("\n");
    const chunks = buildCodeChunks("demo-room", code, "javascript");
    const repeatedChunks = buildCodeChunks("demo-room", code, "javascript");

    expect(chunks).toHaveLength(2);
    expect(chunks[0].startLine).toBe(1);
    expect(chunks[0].endLine).toBe(80);
    expect(chunks[1].startLine).toBe(73);
    expect(chunks[1].endLine).toBe(95);
    expect(chunks.map((chunk) => chunk.id)).toEqual(repeatedChunks.map((chunk) => chunk.id));
  });

  it("skips empty code", () => {
    expect(buildCodeChunks("demo-room", "\n\n", "javascript")).toEqual([]);
  });
});

