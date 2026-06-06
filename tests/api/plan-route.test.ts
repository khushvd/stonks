import { describe, expect, it, vi } from "vitest";
import type { AnalystPlan } from "../../src/planner/plan.js";

const mockedPlan: AnalystPlan = {
  company: { name: "Asian Paints", slug: "ASIANPAINT" },
  focusAreas: ["margins"],
  sourcePolicy: "latest quarterly results and investor presentations",
  metrics: ["opm_pct"],
  peers: [
    { name: "Berger Paints", slug: "BERGEPAINT", reason: "direct paint peer" },
    { name: "Kansai Nerolac", slug: "KANSAINER", reason: "paint category peer" },
    { name: "Indigo Paints", slug: "INDIGOPNTS", reason: "listed paint peer" },
  ],
  notebookQuestions: ["How have margins moved?"],
};

vi.mock("../../src/planner/run.js", () => ({
  runPlanner: vi.fn(async () => mockedPlan),
}));

const { POST } = await import("../../app/api/plan/route.js");
const { runPlanner } = await import("../../src/planner/run.js");

describe("/api/plan", () => {
  it("returns a mocked planner plan for valid input", async () => {
    const res = await POST(new Request("http://localhost/api/plan", {
      method: "POST",
      body: JSON.stringify({ company: "Asian Paints", ask: "compare margins" }),
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ plan: mockedPlan });
    expect(runPlanner).toHaveBeenCalledWith("Asian Paints", "compare margins");
  });

  it("rejects a missing company", async () => {
    const res = await POST(new Request("http://localhost/api/plan", {
      method: "POST",
      body: JSON.stringify({ ask: "compare margins" }),
    }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "missing company" });
  });
});
