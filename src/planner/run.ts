import { spawn as nodeSpawn } from "node:child_process";
import type { CoordinatorProvider } from "../coordinator/types.js";
import type { SpawnedProcess, Spawner } from "../coordinator/types.js";
import { buildPlannerPrompt, parsePlannerJson, type AnalystPlan } from "./plan.js";

type Env = Partial<Record<string, string>>;

export interface PlannerInvocation {
  provider: CoordinatorProvider;
  cmd: string;
  args: string[];
}

export function plannerProviderFromEnv(env: Env = process.env): CoordinatorProvider {
  const provider = (env.PLANNER_PROVIDER ?? env.COORDINATOR_PROVIDER ?? "claude").trim().toLowerCase();
  if (provider === "claude" || provider === "codex") return provider;
  throw new Error(`Invalid planner provider "${provider}". Use PLANNER_PROVIDER or COORDINATOR_PROVIDER with "claude" or "codex".`);
}

export function plannerArgs(prompt: string, model = "haiku"): string[] {
  return [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    model,
  ];
}

export function codexPlannerArgs(prompt: string, cwd = process.cwd(), model = "gpt-5.4-mini"): string[] {
  return [
    "exec",
    "--json",
    "--model",
    model,
    "--sandbox",
    "workspace-write",
    "--cd",
    cwd,
    prompt,
  ];
}

export function plannerInvocation(
  prompt: string,
  env: Env = process.env,
  cwd = process.cwd(),
): PlannerInvocation {
  const provider = plannerProviderFromEnv(env);
  if (provider === "codex") {
    return {
      provider,
      cmd: env.CODEX_BIN ?? "codex",
      args: codexPlannerArgs(prompt, cwd, env.PLANNER_CODEX_MODEL ?? "gpt-5.4-mini"),
    };
  }
  return {
    provider,
    cmd: env.CLAUDE_BIN ?? "claude",
    args: plannerArgs(prompt, env.PLANNER_CLAUDE_MODEL ?? "haiku"),
  };
}

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
  return {
    stdout: child.stdout as AsyncIterable<string>,
    exitCode,
    stderr: exitCode.then(() => stderrBuf),
    kill: () => child.kill(),
  };
};

function resultTextFromClaudeLine(line: string): string | null {
  try {
    const parsed = JSON.parse(line.trim()) as { type?: string; result?: string; is_error?: boolean };
    if (parsed.type !== "result") return null;
    if (parsed.is_error) throw new Error(parsed.result ?? "planner failed");
    return parsed.result ?? "";
  } catch (e) {
    if (e instanceof SyntaxError) return null;
    throw e;
  }
}

function resultTextFromCodexLine(line: string): string | null {
  try {
    const parsed = JSON.parse(line.trim()) as {
      type?: string;
      error?: { message?: string };
      item?: { type?: string; text?: string };
    };
    if (parsed.type === "turn.failed") throw new Error(parsed.error?.message ?? "planner failed");
    if (parsed.type !== "item.completed") return null;
    if (parsed.item?.type !== "agent_message") return null;
    return parsed.item.text ?? "";
  } catch (e) {
    if (e instanceof SyntaxError) return null;
    throw e;
  }
}

function resultTextFromLine(line: string, provider: CoordinatorProvider): string | null {
  return provider === "codex" ? resultTextFromCodexLine(line) : resultTextFromClaudeLine(line);
}

export async function runPlanner(company: string, ask: string, spawn: Spawner = defaultSpawn): Promise<AnalystPlan> {
  const invocation = plannerInvocation(buildPlannerPrompt(company, ask));
  const proc = spawn(invocation.cmd, invocation.args);
  let buf = "";
  let result = "";

  for await (const chunk of proc.stdout) {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      const text = resultTextFromLine(line, invocation.provider);
      if (text !== null) result = text;
    }
  }
  const trailing = resultTextFromLine(buf, invocation.provider);
  if (trailing !== null) result = trailing;

  const code = await proc.exitCode;
  if (code !== 0) {
    const detail = (await proc.stderr)?.trim();
    throw new Error(detail ? `planner exited with code ${code}: ${detail}` : `planner exited with code ${code}`);
  }
  if (!result.trim()) throw new Error("planner produced no result");
  return parsePlannerJson(result);
}
