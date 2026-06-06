import { describe, expect, it } from "vitest";
import {
  codexPlannerArgs,
  plannerArgs,
  plannerInvocation,
  plannerProviderFromEnv,
  runPlanner,
} from "../../src/planner/run.js";
import type { Spawner } from "../../src/coordinator/types.js";

function fakeSpawner(chunks: string[], exit = 0): Spawner {
  return () => ({
    stdout: (async function* () {
      for (const chunk of chunks) yield chunk;
    })(),
    exitCode: Promise.resolve(exit),
  });
}

describe("plannerArgs", () => {
  it("pins a cheap Claude model and requests stream-json", () => {
    const args = plannerArgs("PROMPT");
    expect(args).toContain("--model");
    expect(args[args.indexOf("--model") + 1]).toBe("haiku");
    expect(args).toContain("--output-format");
    expect(args[args.indexOf("--output-format") + 1]).toBe("stream-json");
  });
});

describe("plannerProviderFromEnv", () => {
  it("defaults to claude", () => {
    expect(plannerProviderFromEnv({})).toBe("claude");
  });

  it("accepts an explicit planner provider", () => {
    expect(plannerProviderFromEnv({ PLANNER_PROVIDER: "codex" })).toBe("codex");
  });

  it("falls back to the old coordinator env for compatibility", () => {
    expect(plannerProviderFromEnv({ COORDINATOR_PROVIDER: "codex" })).toBe("codex");
  });

  it("rejects unknown providers clearly", () => {
    expect(() => plannerProviderFromEnv({ PLANNER_PROVIDER: "grok" })).toThrow(/PLANNER_PROVIDER|COORDINATOR_PROVIDER/i);
  });
});

describe("codexPlannerArgs", () => {
  it("uses non-interactive JSONL output with workspace sandboxing", () => {
    const args = codexPlannerArgs("PROMPT", "/repo");
    expect(args).toContain("exec");
    expect(args).toContain("--json");
    expect(args).toContain("--model");
    expect(args[args.indexOf("--model") + 1]).toBe("gpt-5.4-mini");
    expect(args).toContain("--sandbox");
    expect(args[args.indexOf("--sandbox") + 1]).toBe("workspace-write");
    expect(args).not.toContain("--ask-for-approval");
    expect(args).toContain("--cd");
    expect(args[args.indexOf("--cd") + 1]).toBe("/repo");
    expect(args.at(-1)).toBe("PROMPT");
  });
});

describe("plannerInvocation", () => {
  it("resolves the default Claude planner invocation", () => {
    const invocation = plannerInvocation("PROMPT", {}, "/repo");
    expect(invocation.provider).toBe("claude");
    expect(invocation.cmd).toBe("claude");
    expect(invocation.args).toEqual(plannerArgs("PROMPT"));
  });

  it("resolves a Codex planner invocation from env", () => {
    const invocation = plannerInvocation(
      "PROMPT",
      { PLANNER_PROVIDER: "codex", CODEX_BIN: "/bin/codex", PLANNER_CODEX_MODEL: "gpt-test" },
      "/repo",
    );
    expect(invocation.provider).toBe("codex");
    expect(invocation.cmd).toBe("/bin/codex");
    expect(invocation.args[invocation.args.indexOf("--model") + 1]).toBe("gpt-test");
  });
});

describe("runPlanner", () => {
  it("parses the Claude stream-json result line into a typed plan", async () => {
    const result = JSON.stringify({
      type: "result",
      is_error: false,
      result: JSON.stringify({
        company: { name: "Asian Paints", slug: "ASIANPAINT" },
        focusAreas: ["Paint demand and margin durability"],
        sourcePolicy: "latest filings only",
        metrics: ["revenue", "ebitda_margin"],
        peers: [
          { name: "Berger Paints", slug: "BERGEPAINT", reason: "decorative paints peer" },
          { name: "Kansai Nerolac", slug: "KANSAINER", reason: "decorative paints peer" },
          { name: "Akzo Nobel India", slug: "AKZOINDIA", reason: "premium coatings peer" },
        ],
        notebookQuestions: ["What changed in gross margin and why?"],
      }),
    });
    const plan = await runPlanner("Asian Paints", "Compare margins", fakeSpawner([result + "\n"]));
    expect(plan.company.slug).toBe("ASIANPAINT");
    expect(plan.peers).toHaveLength(3);
  });

  it("spawns Codex and parses the final completed agent message when planner provider is codex", async () => {
    const previousPlannerProvider = process.env.PLANNER_PROVIDER;
    const previousCoordinatorProvider = process.env.COORDINATOR_PROVIDER;
    const previousBin = process.env.CODEX_BIN;
    process.env.PLANNER_PROVIDER = "codex";
    process.env.COORDINATOR_PROVIDER = "claude";
    process.env.CODEX_BIN = "/bin/codex";

    const spawned: { cmd: string; args: string[] } = { cmd: "", args: [] };
    const spawn: Spawner = (cmd, args) => {
      spawned.cmd = cmd;
      spawned.args = args;
      return {
        stdout: (async function* () {
          yield JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "thinking" } }) + "\n";
          yield JSON.stringify({
            type: "item.completed",
            item: {
              type: "agent_message",
              text: JSON.stringify({
                company: { name: "Asian Paints", slug: "ASIANPAINT" },
                focusAreas: ["Paint demand and margin durability"],
                sourcePolicy: "latest filings only",
                metrics: ["revenue", "ebitda_margin"],
                peers: [
                  { name: "Berger Paints", slug: "BERGEPAINT", reason: "decorative paints peer" },
                  { name: "Kansai Nerolac", slug: "KANSAINER", reason: "decorative paints peer" },
                  { name: "Akzo Nobel India", slug: "AKZOINDIA", reason: "premium coatings peer" },
                ],
                notebookQuestions: ["What changed in gross margin and why?"],
              }),
            },
          }) + "\n";
          yield JSON.stringify({ type: "turn.completed" }) + "\n";
        })(),
        exitCode: Promise.resolve(0),
      };
    };

    try {
      const plan = await runPlanner("Asian Paints", "Compare margins", spawn);
      expect(spawned.cmd).toBe("/bin/codex");
      expect(spawned.args).toContain("exec");
      expect(plan.company.slug).toBe("ASIANPAINT");
    } finally {
      if (previousPlannerProvider === undefined) delete process.env.PLANNER_PROVIDER;
      else process.env.PLANNER_PROVIDER = previousPlannerProvider;
      if (previousCoordinatorProvider === undefined) delete process.env.COORDINATOR_PROVIDER;
      else process.env.COORDINATOR_PROVIDER = previousCoordinatorProvider;
      if (previousBin === undefined) delete process.env.CODEX_BIN;
      else process.env.CODEX_BIN = previousBin;
    }
  });
});
