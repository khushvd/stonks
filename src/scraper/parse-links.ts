import * as cheerio from "cheerio";
import type { FilingLink, FilingType } from "../types.js";

function classify(text: string, href: string): FilingType | null {
  const s = `${text} ${href}`.toLowerCase();
  if (/annual\s*report/.test(s)) return "annual_report";
  if (/transcript|concall|earnings\s*call|result/.test(s)) return "result";
  if (/presentation|investor\s*ppt|\bppt\b/.test(s)) return "presentation";
  return null;
}

// Normalizes "Q4 FY26", "Q4FY26", "FY25" -> "Q4FY26" / "FY25"; null if none found.
function extractPeriod(text: string): string | null {
  const q = text.match(/Q([1-4])\s*FY\s*?(\d{2,4})/i);
  if (q) return `Q${q[1]}FY${q[2]}`;
  const fy = text.match(/FY\s*?(\d{2,4})/i);
  if (fy) return `FY${fy[1]}`;
  return null;
}

export function parseFilingLinks(html: string): FilingLink[] {
  const $ = cheerio.load(html);
  const links: FilingLink[] = [];
  $("a").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().trim();
    if (!href.toLowerCase().includes(".pdf")) return;
    const type = classify(text, href);
    if (!type) return;
    links.push({ type, period: extractPeriod(text), url: href });
  });
  return links;
}
