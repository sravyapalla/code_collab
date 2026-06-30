import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type ServerProcess = {
  name: string;
  pid: number;
};

const rootDir = process.cwd();
const serverStatePath = path.join(rootDir, "test-results", "servers.json");

async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      // The server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function startServer(name: string, args: string[], cwd: string): ServerProcess {
  const child = spawn(process.execPath, args, {
    cwd,
    env: process.env,
    stdio: "ignore"
  });

  if (!child.pid) {
    throw new Error(`Could not start ${name}.`);
  }

  child.unref();

  return {
    name,
    pid: child.pid
  };
}

export default async function globalSetup(): Promise<void> {
  await mkdir(path.dirname(serverStatePath), { recursive: true });

  const backend = startServer("backend", ["dist/index.js"], path.join(rootDir, "backend"));
  const frontend = startServer(
    "frontend",
    ["../node_modules/vite/bin/vite.js", "preview", "--host", "localhost", "--port", "5173"],
    path.join(rootDir, "frontend")
  );

  await writeFile(serverStatePath, JSON.stringify([backend, frontend], null, 2));
  await waitForUrl("http://localhost:8000/health", 30_000);
  await waitForUrl("http://localhost:5173", 30_000);
}

