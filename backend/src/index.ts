import "dotenv/config";
import cors from "cors";
import express from "express";
import http from "node:http";
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
  ? new PostgresRoomRepository(config.databaseUrl)
  : new MemoryRoomRepository();
const aiProvider = createAiProvider(config);
const roomService = new RoomService(repository);
const retrievalService = new RetrievalService(repository, aiProvider, config);
const aiService = new AiService(repository, roomService, retrievalService, aiProvider, config);

app.use(cors({ origin: config.frontendOrigin }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    storage: config.databaseUrl ? "postgres" : "memory",
    ai: aiProvider.isConfigured ? aiProvider.providerName : "disabled"
  });
});

app.use("/api", createAiRouter(aiService));

const io = new Server(server, {
  cors: {
    origin: config.frontendOrigin,
    methods: ["GET", "POST"]
  }
});

registerSocketHandlers(io, roomService, retrievalService);

await repository.init();

server.listen(config.port, () => {
  console.log(`Code Collab backend running on http://localhost:${config.port}`);
  console.log(`Storage: ${config.databaseUrl ? "PostgreSQL + pgvector" : "memory fallback"}`);
  console.log(`AI: ${aiProvider.isConfigured ? `${aiProvider.providerName}/${aiProvider.model}` : "disabled"}`);
});

process.on("SIGTERM", () => {
  server.close(() => {
    repository.close().catch((error: unknown) => console.error("Failed to close repository", error));
  });
});

