import { describe, expect, it } from "vitest";
import { buildPeerKpiPrompt, parsePeerKpiAnswer } from "../../src/peer-kpis/peer-kpis.js";

describe("buildPeerKpiPrompt", () => {
  it("requires found or missing rows for every expected KPI", () => {
    const prompt = buildPeerKpiPrompt("SAMHI Hotels", "Why RevPAR?", [
      { metric_key: "revpar", label: "RevPAR", unit: "rs", priority: 10 },
      { metric_key: "occupancy", label: "Occupancy", unit: "%", priority: 20 },
    ]);

    expect(prompt).toContain("SAMHI Hotels");
    expect(prompt).toContain("RevPAR");
    expect(prompt).toContain('"status":"found"|"missing"');
    expect(prompt).toContain("Return one row for EVERY expected KPI");
  });
});

describe("parsePeerKpiAnswer", () => {
  it("parses prose-wrapped found and missing KPI rows", () => {
    const parsed = parsePeerKpiAnswer(
      "Here:\n```json\n{\"kpis\":[{\"metric_key\":\"revpar\",\"label\":\"RevPAR\",\"status\":\"missing\",\"missing_reason\":\"not disclosed\"},{\"metric_key\":\"occupancy\",\"label\":\"Occupancy\",\"status\":\"found\",\"value\":72,\"unit\":\"%\",\"period\":\"Q4FY26\",\"cite\":1}]}\n```",
    );

    expect(parsed).toEqual([
      { metric_key: "revpar", label: "RevPAR", status: "missing", missing_reason: "not disclosed", unit: null },
      { metric_key: "occupancy", label: "Occupancy", status: "found", value: 72, unit: "%", period: "Q4FY26", cite: 1 },
    ]);
  });

  it("returns an empty list for malformed output", () => {
    expect(parsePeerKpiAnswer("not json")).toEqual([]);
  });
});
