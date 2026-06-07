import { spawn as nodeSpawn } from "node:child_process";
import type { AgentEvent, SpawnedProcess, Spawner } from "../coordinator/types.js";
import type { AnalystPlan, PeerPlan } from "../planner/plan.js";

export interface ExecutionCommand {
  id: string;
  label: string;
  cmd: string;
  args: string[];
}

export interface RunExecutionOptions {
  startAtStepId?: string;
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

function scrapeCommand(company: { name: string; slug: string }, label: string, id: string): ExecutionCommand {
  return {
    id,
    label,
    cmd: "pnpm",
    args: ["scrape", "--name", company.name, "--slug", company.slug, "--annual", "--per-type", "4"],
  };
}

export function buildExecutionCommands(plan: AnalystPlan, ask: string): ExecutionCommand[] {
  const peerCommands = plan.peers.map((peer: PeerPlan) =>
    scrapeCommand(peer, `Scrape peer ${peer.name}`, `scrape:peer:${peer.slug}`),
  );
  const companies = [plan.company, ...plan.peers];
  const peerIngestCommands = plan.peers.map((peer: PeerPlan): ExecutionCommand => ({
    id: `ingest:peer:${peer.slug}`,
    label: `Ingest peer ${peer.name} into NotebookLM`,
    cmd: "pnpm",
    args: ["ingest", peer.name],
  }));
  const companyNames = companies.map((c) => c.name).join(",");
  const verifyCommands = companies.map((company): ExecutionCommand => ({
    id: `verify:${company.slug}`,
    label: `Verify staged metrics for ${company.name}`,
    cmd: "pnpm",
    args: ["verify", company.name],
  }));

  return [
    scrapeCommand(plan.company, `Scrape ${plan.company.name}`, "scrape:main"),
    ...peerCommands,
    { id: "ingest:main", label: `Ingest ${plan.company.name} into NotebookLM`, cmd: "pnpm", args: ["ingest", plan.company.name] },
    ...peerIngestCommands,
    { id: "synthesize:main", label: "Synthesize cited brief", cmd: "pnpm", args: ["synthesize", plan.company.name, ask] },
    { id: "peer-kpis", label: "Extract peer sector KPI pack", cmd: "pnpm", args: ["peer-kpis", plan.company.name, "--ask", ask, "--companies", companyNames] },
    ...verifyCommands,
    { id: "db:summary", label: "Summarize database", cmd: "pnpm", args: ["db", "summary"] },
  ];
}

async function drain(stdout: AsyncIterable<string>): Promise<void> {
  for await (const _chunk of stdout) {
    // Drain child stdout so large JSON outputs cannot fill the pipe and block the deterministic chain.
  }
}

export async function* runExecution(
  plan: AnalystPlan,
  ask: string,
  spawn: Spawner = defaultSpawn,
  signal?: AbortSignal,
  options: RunExecutionOptions = {},
): AsyncIterable<AgentEvent> {
  let current: SpawnedProcess | null = null;
  const onAbort = () => current?.kill?.();
  if (signal) signal.addEventListener("abort", onAbort);

  try {
    const commands = buildExecutionCommands(plan, ask);
    const startIndex = options.startAtStepId ? commands.findIndex((command) => command.id === options.startAtStepId) : 0;
    if (startIndex === -1) {
      yield { kind: "error", stepId: options.startAtStepId, message: `Unknown resume step: ${options.startAtStepId}` };
      return;
    }

    for (const command of commands.slice(startIndex)) {
      if (signal?.aborted) return;
      yield { kind: "step", id: command.id, label: command.label };
      current = spawn(command.cmd, command.args);
      const drained = drain(current.stdout);
      const code = await current.exitCode;
      await drained;
      if (signal?.aborted) return;
      if (code !== 0) {
        const detail = (await current.stderr)?.trim();
        const message = detail
          ? `${command.label} failed with code ${code}: ${detail}`
          : `${command.label} failed with code ${code}`;
        yield { kind: "error", stepId: command.id, message };
        return;
      }
      yield { kind: "step-complete", id: command.id, label: command.label };
      current = null;
    }
    yield { kind: "done", ok: true, summary: `Deterministic analysis completed for ${plan.company.name}.` };
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}
