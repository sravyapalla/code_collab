import "dotenv/config";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { readConfig } from "./config.js";
import { MemoryRoomRepository } from "./repositories/memoryRoomRepository.js";
import { PostgresRoomRepository } from "./repositories/postgresRoomRepository.js";
import { RoomRepository } from "./repositories/roomRepository.js";
import { createAiRouter } from "./routes/aiRoutes.js";
import { createAiProvider } from "./services/aiProvider.js";
import { AiService } from "./services/aiService.js";
import { RetrievalService } from "./services/retrievalService.js";
import { RoomService } from "./services/roomService.js";
import { registerSocketHandlers } from "./socket/registerSocketHandlers.js";

const config = readConfig();
const app = express();
const server = http.createServer(app);

const repository: RoomRepository = config.databaseUrl
  ? new PostgresRoomRepository(config.databaseUrl, config.databaseSsl)
  : new MemoryRoomRepository();
const aiProvider = createAiProvider(config);
const roomService = new RoomService(repository);
const retrievalService = new RetrievalService(repository, aiProvider, config);
const aiService = new AiService(repository, roomService, retrievalService, aiProvider, config);

const corsOrigin = config.frontendOrigins.includes("*") ? true : config.frontendOrigins;

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    storage: config.databaseUrl ? "postgres" : "memory",
    ai: aiProvider.isConfigured ? aiProvider.providerName : "disabled"
  });
});

app.use("/api", createAiRouter(aiService));

if (config.serveFrontend) {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const frontendDistPath = path.resolve(currentDir, "../../frontend/dist");
  const frontendIndexPath = path.join(frontendDistPath, "index.html");

  if (fs.existsSync(frontendIndexPath)) {
    app.use(express.static(frontendDistPath));
    app.get("*", (req, res, next) => {
      if (req.path === "/health" || req.path.startsWith("/api") || req.path.startsWith("/socket.io")) {
        next();
        return;
      }

      res.sendFile(frontendIndexPath);
    });
  } else {
    console.warn(`SERVE_FRONTEND is enabled but ${frontendIndexPath} was not found.`);
  }
}

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"]
  }
});

registerSocketHandlers(io, roomService, retrievalService);

await repository.init();

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Code Collab backend running on http://localhost:${config.port}`);
  console.log(`Storage: ${config.databaseUrl ? "PostgreSQL + pgvector" : "memory fallback"}`);
  console.log(`AI: ${aiProvider.isConfigured ? `${aiProvider.providerName}/${aiProvider.model}` : "disabled"}`);
  console.log(`Frontend origins: ${config.frontendOrigins.join(", ")}`);
});

process.on("SIGTERM", () => {
  server.close(() => {
    repository.close().catch((error: unknown) => console.error("Failed to close repository", error));
  });
});
