import { Router } from "express";
import { AiService } from "../services/aiService.js";
import { parseAiStreamRequest } from "../utils/validation.js";

function writeSse(res: { write: (value: string) => void }, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function createAiRouter(aiService: AiService): Router {
  const router = Router();

  router.get("/rooms/:roomId/ai/messages", async (req, res) => {
    try {
      const messages = await aiService.listMessages(req.params.roomId.trim());
      res.json({ messages });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : "Could not load AI messages." });
    }
  });

  router.post("/rooms/:roomId/reindex", async (req, res) => {
    try {
      const indexedChunks = await aiService.reindexRoom(req.params.roomId.trim());
      res.json({ indexedChunks });
    } catch (error) {
      res.status(500).json({ message: error instanceof Error ? error.message : "Could not reindex room." });
    }
  });

  router.post("/rooms/:roomId/ai/stream", async (req, res) => {
    const parsedRequest = parseAiStreamRequest(req.body);

    if (!parsedRequest) {
      res.status(400).json({ message: "AI request is invalid." });
      return;
    }

    try {
      const result = await aiService.createStream(req.params.roomId.trim(), parsedRequest);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });

      writeSse(res, "user-message", result.userMessage);
      writeSse(res, "assistant-start", {
        ...result.assistantMessage,
        content: ""
      });

      let content = "";

      for await (const delta of result.stream) {
        content += delta;
        writeSse(res, "token", { delta });
      }

      writeSse(res, "done", {
        ...result.assistantMessage,
        content
      });
      res.end();
    } catch (error) {
      if (!res.headersSent) {
        res.status(400).json({ message: error instanceof Error ? error.message : "AI request failed." });
        return;
      }

      writeSse(res, "error", { message: error instanceof Error ? error.message : "AI request failed." });
      res.end();
    }
  });

  return router;
}

