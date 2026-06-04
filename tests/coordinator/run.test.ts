import { describe, it, expect } from "vitest";
import { runCoordinator, COORDINATOR_ARGS } from "../../src/coordinator/run.js";
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

describe("COORDINATOR_ARGS", () => {
  it("pins a cheap model and requests stream-json (constraint: no Opus)", () => {
    const args = COORDINATOR_ARGS("PROMPT");
    expect(args).toContain("--model");
    expect(args[args.indexOf("--model") + 1]).toBe("sonnet");
    expect(args).toContain("--output-format");
    expect(args[args.indexOf("--output-format") + 1]).toBe("stream-json");
    expect(args).toContain("--verbose");
    expect(args).toContain("-p");
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
    expect(events.at(-1)).toEqual({ kind: "error", message: expect.stringContaining("exited with code 1") });
  });

  it("does not double-emit a synthetic error when a real done already arrived", async () => {
    const b = JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "ok." });
    const spawn = fakeSpawner([b + "\n"], 0);
    const events = await collect(runCoordinator("X", "ask", spawn));
    expect(events).toEqual([{ kind: "done", ok: true, summary: "ok." }]);
  });
});
