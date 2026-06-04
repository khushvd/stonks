import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFinancials, type ScreenerRow } from "../../src/scraper/parse-financials.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(join(here, "..", "fixtures", "screener-company.html"), "utf8");

describe("parseFinancials", () => {
  it("extracts quarterly Revenue rows with period labels", () => {
    const rows = parseFinancials(fixtureHtml, "quarterly");
    const revRows = rows.filter((r) => r.metric_key === "revenue");
    expect(revRows.length).toBeGreaterThan(0);
    // Each row should have a period like "Mar 2023", "Jun 2024" etc.
    expect(revRows[0].period).toMatch(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/);
    // Values should be positive numbers in crores
    expect(revRows[0].value).toBeGreaterThan(0);
    expect(revRows[0].unit).toBe("cr");
  });

  it("extracts quarterly Net Profit rows", () => {
    const rows = parseFinancials(fixtureHtml, "quarterly");
    const patRows = rows.filter((r) => r.metric_key === "pat");
    expect(patRows.length).toBeGreaterThan(0);
    expect(patRows[0].value).toBeGreaterThan(0);
  });

  it("extracts quarterly OPM% rows", () => {
    const rows = parseFinancials(fixtureHtml, "quarterly");
    const opmRows = rows.filter((r) => r.metric_key === "opm_pct");
    expect(opmRows.length).toBeGreaterThan(0);
    // OPM % should be a percentage value (e.g. 17.5 or stored as 17.5 not 0.175)
    expect(opmRows[0].unit).toBe("%");
  });

  it("extracts annual Revenue rows", () => {
    const rows = parseFinancials(fixtureHtml, "annual");
    const revRows = rows.filter((r) => r.metric_key === "revenue");
    expect(revRows.length).toBeGreaterThan(0);
    expect(revRows[0].period).toMatch(/Mar\s+\d{4}/);
  });

  it("extracts EPS rows from annual table", () => {
    const rows = parseFinancials(fixtureHtml, "annual");
    const epsRows = rows.filter((r) => r.metric_key === "eps");
    expect(epsRows.length).toBeGreaterThan(0);
    expect(epsRows[0].unit).toBe("rs");
  });

  it("returns an empty array on empty/invalid HTML", () => {
    const rows = parseFinancials("<html><body></body></html>", "quarterly");
    expect(rows).toEqual([]);
  });

  it("each row has required fields", () => {
    const rows = parseFinancials(fixtureHtml, "quarterly");
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(typeof row.metric_key).toBe("string");
      expect(typeof row.value).toBe("number");
      expect(typeof row.period).toBe("string");
    }
  });
});
