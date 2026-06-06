import { spawn as nodeSpawn } from "node:child_process";
import type { AgentEvent, SpawnedProcess, Spawner } from "../coordinator/types.js";
import type { AnalystPlan, PeerPlan } from "../planner/plan.js";

export interface ExecutionCommand {
  label: string;
  cmd: string;
  args: string[];
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

function scrapeCommand(company: { name: string; slug: string }, label: string): ExecutionCommand {
  return {
    label,
    cmd: "pnpm",
    args: ["scrape", "--name", company.name, "--slug", company.slug, "--annual", "--per-type", "4"],
  };
}

export function buildExecutionCommands(plan: AnalystPlan, ask: string): ExecutionCommand[] {
  const peerCommands = plan.peers.map((peer: PeerPlan) =>
    scrapeCommand(peer, `Scrape peer ${peer.name}`),
  );
  const companies = [plan.company, ...plan.peers];
  const peerIngestCommands = plan.peers.map((peer: PeerPlan): ExecutionCommand => ({
    label: `Ingest peer ${peer.name} into NotebookLM`,
    cmd: "pnpm",
    args: ["ingest", peer.name],
  }));
  const companyNames = companies.map((c) => c.name).join(",");
  const verifyCommands = companies.map((company): ExecutionCommand => ({
    label: `Verify staged metrics for ${company.name}`,
    cmd: "pnpm",
    args: ["verify", company.name],
  }));

  return [
    scrapeCommand(plan.company, `Scrape ${plan.company.name}`),
    ...peerCommands,
    { label: `Ingest ${plan.company.name} into NotebookLM`, cmd: "pnpm", args: ["ingest", plan.company.name] },
    ...peerIngestCommands,
    { label: "Synthesize cited brief", cmd: "pnpm", args: ["synthesize", plan.company.name, ask] },
    { label: "Extract peer sector KPI pack", cmd: "pnpm", args: ["peer-kpis", plan.company.name, "--ask", ask, "--companies", companyNames] },
    ...verifyCommands,
    { label: "Summarize database", cmd: "pnpm", args: ["db", "summary"] },
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
): AsyncIterable<AgentEvent> {
  let current: SpawnedProcess | null = null;
  const onAbort = () => current?.kill?.();
  if (signal) signal.addEventListener("abort", onAbort);

  try {
    for (const command of buildExecutionCommands(plan, ask)) {
      if (signal?.aborted) return;
      yield { kind: "step", label: command.label };
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
        yield { kind: "error", message };
        return;
      }
      current = null;
    }
    yield { kind: "done", ok: true, summary: `Deterministic analysis completed for ${plan.company.name}.` };
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}
