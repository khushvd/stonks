import { describe, it, expect } from "vitest";
import {
  codexCoordinatorArgs,
  coordinatorArgs,
  coordinatorInvocation,
  providerFromEnv,
  runCoordinator,
} from "../../src/coordinator/run.js";
import type { Spawner, AgentEvent } from "../../src/coordinator/types.js";

// A fake spawner that yields the given raw chunks (deliberately split mid-line to prove buffering).
function fakeSpawner(chunks: string[], exit = 0): Spawner {
  return () => ({
    stdout: (async function* () {
      for (const c of chunks) yield c;
    })(),
    exitCode: Promise.resolve(exit),
  });
}

async function collect(it: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const ev of it) out.push(ev);
  return out;
}

describe("coordinatorArgs", () => {
  it("pins a cheap model and requests stream-json (constraint: no Opus)", () => {
    const args = coordinatorArgs("PROMPT");
    expect(args).toContain("--model");
    expect(args[args.indexOf("--model") + 1]).toBe("sonnet");
    expect(args).toContain("--output-format");
    expect(args[args.indexOf("--output-format") + 1]).toBe("stream-json");
    expect(args).toContain("--verbose");
    expect(args).toContain("-p");
  });
});

describe("providerFromEnv", () => {
  it("defaults to claude", () => {
    expect(providerFromEnv({})).toBe("claude");
  });

  it("accepts codex explicitly", () => {
    expect(providerFromEnv({ COORDINATOR_PROVIDER: "codex" })).toBe("codex");
  });

  it("rejects unknown providers clearly", () => {
    expect(() => providerFromEnv({ COORDINATOR_PROVIDER: "grok" })).toThrow(/COORDINATOR_PROVIDER/i);
  });
});

describe("codexCoordinatorArgs", () => {
  it("uses non-interactive JSONL output with workspace sandboxing", () => {
    const args = codexCoordinatorArgs("PROMPT", "/repo");
    expect(args).toContain("exec");
    expect(args).toContain("--json");
    expect(args).toContain("--model");
    expect(args[args.indexOf("--model") + 1]).toBe("gpt-5.4-mini");
    expect(args).toContain("--sandbox");
    expect(args[args.indexOf("--sandbox") + 1]).toBe("workspace-write");
    expect(args).toContain("--ask-for-approval");
    expect(args[args.indexOf("--ask-for-approval") + 1]).toBe("never");
    expect(args).toContain("--cd");
    expect(args[args.indexOf("--cd") + 1]).toBe("/repo");
    expect(args.at(-1)).toBe("PROMPT");
  });
});

describe("coordinatorInvocation", () => {
  it("resolves the default claude invocation", () => {
    const invocation = coordinatorInvocation("PROMPT", {}, "/repo");
    expect(invocation.provider).toBe("claude");
    expect(invocation.cmd).toBe("claude");
    expect(invocation.args).toEqual(coordinatorArgs("PROMPT"));
  });

  it("resolves a codex invocation from env", () => {
    const invocation = coordinatorInvocation(
      "PROMPT",
      { COORDINATOR_PROVIDER: "codex", CODEX_BIN: "/bin/codex", COORDINATOR_CODEX_MODEL: "gpt-test" },
      "/repo",
    );
    expect(invocation.provider).toBe("codex");
    expect(invocation.cmd).toBe("/bin/codex");
    expect(invocation.args[invocation.args.indexOf("--model") + 1]).toBe("gpt-test");
  });
});

describe("runCoordinator", () => {
  it("buffers chunks across newlines and emits the event sequence", async () => {
    const a = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "pnpm scrape 'X'" } }] } });
    const b = JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "done." });
    // split the first JSON object across two chunks, and pack two lines into one chunk
    const mid = Math.floor(a.length / 2);
    const spawn = fakeSpawner([a.slice(0, mid), a.slice(mid) + "\n" + b + "\n"]);
    const events = await collect(runCoordinator("X", "ask", spawn));
    expect(events).toEqual([
      { kind: "step", label: "Scrape screener" },
      { kind: "done", ok: true, summary: "done." },
    ]);
  });

  it("emits a terminal error event when the process exits non-zero without a result line", async () => {
    const spawn = fakeSpawner(["garbage\n"], 1);
    const events = await collect(runCoordinator("X", "ask", spawn));
    expect(events).toHaveLength(1);
    expect(events.at(-1)).toEqual({ kind: "error", message: expect.stringContaining("exited with code 1") });
  });

  it("does not double-emit a synthetic error when a real done already arrived", async () => {
    const b = JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "ok." });
    const spawn = fakeSpawner([b + "\n"], 0);
    const events = await collect(runCoordinator("X", "ask", spawn));
    expect(events).toEqual([{ kind: "done", ok: true, summary: "ok." }]);
  });

  it("spawns codex and parses codex JSONL when COORDINATOR_PROVIDER=codex", async () => {
    const previousProvider = process.env.COORDINATOR_PROVIDER;
    const previousBin = process.env.CODEX_BIN;
    process.env.COORDINATOR_PROVIDER = "codex";
    process.env.CODEX_BIN = "/bin/codex";
    const spawned: { cmd: string; args: string[] } = { cmd: "", args: [] };
    const spawn: Spawner = (cmd, args) => {
      spawned.cmd = cmd;
      spawned.args = args;
      return {
        stdout: (async function* () {
          yield JSON.stringify({ type: "item.started", item: { type: "command_execution", command: "pnpm verify" } }) + "\n";
          yield JSON.stringify({ type: "turn.completed" }) + "\n";
        })(),
        exitCode: Promise.resolve(0),
      };
    };

    try {
      const events = await collect(runCoordinator("X", "ask", spawn));
      expect(spawned.cmd).toBe("/bin/codex");
      expect(spawned.args).toContain("exec");
      expect(events).toEqual([
        { kind: "step", label: "Verify vs source" },
        { kind: "done", ok: true, summary: "" },
      ]);
    } finally {
      if (previousProvider === undefined) delete process.env.COORDINATOR_PROVIDER;
      else process.env.COORDINATOR_PROVIDER = previousProvider;
      if (previousBin === undefined) delete process.env.CODEX_BIN;
      else process.env.CODEX_BIN = previousBin;
    }
  });

  it("kills the subprocess and stops cleanly when the AbortSignal fires (client disconnect)", async () => {
    let killed = false;
    let endStdout: () => void = () => {};
    const stdoutDone = new Promise<void>((r) => {
      endStdout = r;
    });
    // stdout emits one line then blocks forever, simulating a long-running coordinator.
    const spawn: Spawner = () => ({
      stdout: (async function* () {
        yield JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "starting" }] } }) + "\n";
        await stdoutDone; // hang until kill()
      })(),
      exitCode: stdoutDone.then(() => 0),
      kill: () => {
        killed = true;
        endStdout(); // killing the process ends its stdout
      },
    });

    const controller = new AbortController();
    const events: AgentEvent[] = [];
    const pump = (async () => {
      for await (const ev of runCoordinator("X", "ask", spawn, controller.signal)) events.push(ev);
    })();

    await new Promise((r) => setTimeout(r, 10)); // let the first event flush
    controller.abort();
    await pump; // must terminate, not hang

    expect(killed).toBe(true);
    expect(events[0]).toEqual({ kind: "text", text: "starting" });
    // cancelled run: no misleading synthetic "done" appended after the abort
    expect(events.some((e) => e.kind === "done")).toBe(false);
  });
});
