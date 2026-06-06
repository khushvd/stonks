import { describe, expect, it } from "vitest";
import { buildPlannerPrompt, parsePlannerJson } from "../../src/planner/plan.js";

describe("parsePlannerJson", () => {
  it("parses a fenced planner JSON object into the typed execution plan", () => {
    const plan = parsePlannerJson(`
      Here is the bounded plan:
      \`\`\`json
      {
        "company": { "name": "Asian Paints", "slug": "ASIANPAINT" },
        "focusAreas": ["margins", "growth"],
        "sourcePolicy": "latest quarterly results and investor presentations only",
        "metrics": ["revenue", "opm_pct"],
        "peers": [
          { "name": "Berger Paints", "slug": "BERGEPAINT", "reason": "direct decorative paints peer" },
          { "name": "Kansai Nerolac", "slug": "KANSAINER", "reason": "paint category peer" },
          { "name": "Indigo Paints", "slug": "INDIGOPNTS", "reason": "smaller listed paints peer" }
        ],
        "notebookQuestions": ["How have margins moved?", "What drove mix?", "What changed in costs?"]
      }
      \`\`\`
    `);

    expect(plan.company).toEqual({ name: "Asian Paints", slug: "ASIANPAINT" });
    expect(plan.peers.map((p) => p.slug)).toEqual(["BERGEPAINT", "KANSAINER", "INDIGOPNTS"]);
  });

  it("rejects planner output unless exactly three peers are present", () => {
    expect(() => parsePlannerJson(JSON.stringify({
      company: { name: "Asian Paints", slug: "ASIANPAINT" },
      focusAreas: ["margins"],
      sourcePolicy: "latest filings",
      metrics: ["opm_pct"],
      peers: [{ name: "Berger Paints", slug: "BERGEPAINT", reason: "peer" }],
      notebookQuestions: ["How have margins moved?"],
    }))).toThrow(/exactly 3 peers/i);
  });
});

describe("buildPlannerPrompt", () => {
  it("frames planning as JSON only and forbids shell command invention", () => {
    const prompt = buildPlannerPrompt("Asian Paints", "compare margins");
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("Do not invent shell commands");
    expect(prompt).toContain("Asian Paints");
    expect(prompt).toContain("compare margins");
  });
});
