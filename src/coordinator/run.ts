import { spawn as nodeSpawn } from "node:child_process";
import type { AgentEvent, CoordinatorProvider, Spawner, SpawnedProcess } from "./types.js";
import { parseLine } from "./stream.js";
import { buildCoordinatorPrompt } from "./prompt.js";

type Env = Partial<Record<string, string>>;

export interface CoordinatorInvocation {
  provider: CoordinatorProvider;
  cmd: string;
  args: string[];
}

export function providerFromEnv(env: Env = process.env): CoordinatorProvider {
  const provider = (env.COORDINATOR_PROVIDER ?? "claude").trim().toLowerCase();
  if (provider === "claude" || provider === "codex") return provider;
  throw new Error(`Invalid COORDINATOR_PROVIDER "${provider}". Expected "claude" or "codex".`);
}

// Argv for the Claude headless coordinator. Default model stays sonnet (constraint: cheap models only).
// acceptEdits lets allow-listed Bash(pnpm:*) run without an interactive prompt in headless mode.
export function coordinatorArgs(prompt: string, model = "sonnet"): string[] {
  return [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    model,
    "--permission-mode",
    "acceptEdits",
  ];
}

export function codexCoordinatorArgs(prompt: string, cwd = process.cwd(), model = "gpt-5.4-mini"): string[] {
  return [
    "exec",
    "--json",
    "--model",
    model,
    "--sandbox",
    "workspace-write",
    "--ask-for-approval",
    "never",
    "--cd",
    cwd,
    prompt,
  ];
}

export function coordinatorInvocation(
  prompt: string,
  env: Env = process.env,
  cwd = process.cwd(),
): CoordinatorInvocation {
  const provider = providerFromEnv(env);
  if (provider === "codex") {
    return {
      provider,
      cmd: env.CODEX_BIN ?? "codex",
      args: codexCoordinatorArgs(prompt, cwd, env.COORDINATOR_CODEX_MODEL ?? "gpt-5.4-mini"),
    };
  }
  return {
    provider,
    cmd: env.CLAUDE_BIN ?? "claude",
    args: coordinatorArgs(prompt, env.COORDINATOR_CLAUDE_MODEL ?? "sonnet"),
  };
}

// Default spawner: shell out to the selected coordinator binary, exposing stdout as an async string iterable.
// stderr is captured (not discarded) so an auth/startup crash surfaces a diagnosable error message.
const defaultSpawn: Spawner = (cmd, args): SpawnedProcess => {
  const child = nodeSpawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let stderrBuf = "";
  child.stderr.on("data", (chunk: string) => {
    stderrBuf += chunk;
  });
  const exitCode = new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", () => resolve(1));
  });
  const stderr = exitCode.then(() => stderrBuf);
  return {
    stdout: child.stdout as AsyncIterable<string>,
    exitCode,
    stderr,
    kill: () => child.kill(),
  };
};

// Spawn the coordinator and yield AgentEvents. Buffers stdout chunks into whole lines before parsing.
export async function* runCoordinator(
  company: string,
  ask: string,
  spawn: Spawner = defaultSpawn,
  signal?: AbortSignal,
): AsyncIterable<AgentEvent> {
  const prompt = buildCoordinatorPrompt(company, ask);
  const invocation = coordinatorInvocation(prompt);
  const proc = spawn(invocation.cmd, invocation.args);

  // If the consumer aborts (SSE client disconnects), kill the child so the headless run stops billing.
  const onAbort = () => proc.kill?.();
  if (signal) {
    if (signal.aborted) proc.kill?.();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  let buf = "";
  let sawTerminal = false; // a done or error already emitted

  try {
    for await (const chunk of proc.stdout) {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        const ev = parseLine(line, invocation.provider);
        if (ev) {
          if (ev.kind === "done" || ev.kind === "error") sawTerminal = true;
          yield ev;
        }
      }
    }
    // flush any trailing partial line
    const last = parseLine(buf, invocation.provider);
    if (last) {
      if (last.kind === "done" || last.kind === "error") sawTerminal = true;
      yield last;
    }

    const code = await proc.exitCode;
    // Cancelled run: the consumer is gone — don't append a misleading synthetic terminal event.
    if (signal?.aborted) return;
    if (!sawTerminal) {
      if (code === 0) {
        yield { kind: "done", ok: true, summary: "" };
      } else {
        const detail = (await proc.stderr)?.trim();
        const message = detail
          ? `coordinator exited with code ${code}: ${detail}`
          : `coordinator exited with code ${code}`;
        yield { kind: "error", message };
      }
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}
