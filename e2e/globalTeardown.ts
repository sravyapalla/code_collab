import { readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

type ServerProcess = {
  name: string;
  pid: number;
};

const serverStatePath = path.join(process.cwd(), "test-results", "servers.json");

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "ignore"
    });

    child.on("exit", () => resolve());
    child.on("error", () => resolve());
  });
}

async function stopProcessTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    await runCommand("taskkill", ["/pid", String(pid), "/t", "/f"]);
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Already stopped.
  }
}

export default async function globalTeardown(): Promise<void> {
  try {
    const rawState = await readFile(serverStatePath, "utf8");
    const servers = JSON.parse(rawState) as ServerProcess[];

    for (const server of servers.reverse()) {
      await stopProcessTree(server.pid);
    }

    await rm(serverStatePath, { force: true });
  } catch {
    // The setup may have failed before writing server state.
  }
}

