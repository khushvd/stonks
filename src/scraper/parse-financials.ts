import * as cheerio from "cheerio";
// Use cheerio's internal node type (avoids importing domhandler directly).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CheerioNode = any;

export interface ScreenerRow {
  metric_key: string;
  value: number;
  unit: string | null;
  period: string;
}

// Map of screener row label patterns → internal metric_key + unit
const ROW_MAP: Array<{ pattern: RegExp; key: string; unit: string | null; pct?: boolean }> = [
  { pattern: /^Sales$/, key: "revenue", unit: "cr" },
  { pattern: /^Operating Profit$/, key: "ebitda", unit: "cr" },
  { pattern: /^OPM %$/, key: "opm_pct", unit: "%", pct: true },
  { pattern: /^Net Profit/, key: "pat", unit: "cr" },
  { pattern: /^EPS in Rs$/, key: "eps", unit: "rs" },
  { pattern: /^ROCE %$/, key: "roce_pct", unit: "%", pct: true },
];

// Parse a number cell value from screener: "8,787" → 8787, "17.5%" → 17.5, "-" → null
function parseCell(raw: string): number | null {
  const clean = raw.replace(/[,%]/g, "").trim();
  if (!clean || clean === "-") return null;
  const n = parseFloat(clean);
  return Number.isNaN(n) ? null : n;
}

// Normalize a row label: strip &nbsp;, button text, whitespace
function normalizeLabel($: cheerio.CheerioAPI, td: CheerioNode): string {
  // Clone and remove the <span class="blue-icon"> expansion button
  const c = $(td).clone();
  c.find("span").remove();
  return c.text().replace(/ /g, " ").trim();
}

// Extract all ScreenerRow entries from one data-table (quarterly or annual).
function extractFromTable($: cheerio.CheerioAPI, table: CheerioNode): ScreenerRow[] {
  const results: ScreenerRow[] = [];

  // Collect period headers from <thead th>
  const periods: string[] = [];
  $(table).find("thead tr th").each((_i, th) => {
    const text = $(th).text().replace(/ /g, " ").trim();
    if (text) periods.push(text);
  });

  // Walk rows
  $(table).find("tbody tr").each((_i, tr) => {
    const cells = $(tr).find("td").toArray();
    if (cells.length < 2) return;
    const label = normalizeLabel($, cells[0]);
    const match = ROW_MAP.find((r) => r.pattern.test(label));
    if (!match) return;

    // Data cells align to periods (periods[0] corresponds to cells[1])
    for (let ci = 1; ci < cells.length; ci++) {
      const periodIdx = ci - 1;
      if (periodIdx >= periods.length) break;
      const raw = $(cells[ci]).text().trim();
      const value = parseCell(raw);
      if (value === null) continue;
      results.push({
        metric_key: match.key,
        value,
        unit: match.unit,
        period: periods[periodIdx],
      });
    }
  });
  return results;
}

/**
 * Parse screener.in company HTML and extract financial metrics.
 * @param html  Raw screener.in company page HTML
 * @param mode  "quarterly" — parse the quarterly results table (first data-result-table);
 *              "annual"    — parse the P&L annual table (second data-result-table)
 */
export function parseFinancials(html: string, mode: "quarterly" | "annual"): ScreenerRow[] {
  const $ = cheerio.load(html);
  const tables = $("[data-result-table] table").toArray();
  if (tables.length === 0) return [];

  // The quarterly results table is the first [data-result-table] on the page.
  // The P&L annual table is the second.
  const tableIdx = mode === "quarterly" ? 0 : 1;
  const table = tables[tableIdx];
  if (!table) return [];

  return extractFromTable($, table);
}
