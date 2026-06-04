import { spawn as nodeSpawn } from "node:child_process";
import type { AgentEvent, Spawner, SpawnedProcess } from "./types.js";
import { parseLine } from "./stream.js";
import { buildCoordinatorPrompt } from "./prompt.js";

const BIN = process.env.CLAUDE_BIN ?? "claude";

// Argv for the headless coordinator. Model is pinned to sonnet (constraint: cheap models only).
// acceptEdits lets allow-listed Bash(pnpm:*) run without an interactive prompt in headless mode.
export function COORDINATOR_ARGS(prompt: string): string[] {
  return [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    "sonnet",
    "--permission-mode",
    "acceptEdits",
  ];
}

// Default spawner: shell out to the real `claude` binary, exposing stdout as an async string iterable.
const defaultSpawn: Spawner = (cmd, args): SpawnedProcess => {
  const child = nodeSpawn(cmd, args, { stdio: ["ignore", "pipe", "ignore"] });
  child.stdout.setEncoding("utf8");
  const exitCode = new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", () => resolve(1));
  });
  return { stdout: child.stdout as AsyncIterable<string>, exitCode };
};

// Spawn the coordinator and yield AgentEvents. Buffers stdout chunks into whole lines before parsing.
export async function* runCoordinator(
  company: string,
  ask: string,
  spawn: Spawner = defaultSpawn,
): AsyncIterable<AgentEvent> {
  const prompt = buildCoordinatorPrompt(company, ask);
  const proc = spawn(BIN, COORDINATOR_ARGS(prompt));

  let buf = "";
  let sawTerminal = false; // a done or error already emitted

  for await (const chunk of proc.stdout) {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      const ev = parseLine(line);
      if (ev) {
        if (ev.kind === "done" || ev.kind === "error") sawTerminal = true;
        yield ev;
      }
    }
  }
  // flush any trailing partial line
  const last = parseLine(buf);
  if (last) {
    if (last.kind === "done" || last.kind === "error") sawTerminal = true;
    yield last;
  }

  const code = await proc.exitCode;
  if (!sawTerminal) {
    if (code === 0) {
      yield { kind: "done", ok: true, summary: "" };
    } else {
      yield { kind: "error", message: `coordinator exited with code ${code}` };
    }
  }
}
