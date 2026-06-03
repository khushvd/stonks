import { chromium, type Browser, type Page } from "playwright";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { parseFilingLinks } from "./parse-links.js";
import { dataDir } from "../db/db.js";
import type { FilingLink, FilingType } from "../types.js";

async function login(page: Page): Promise<void> {
  await page.goto("https://www.screener.in/login/", { waitUntil: "domcontentloaded" });
  await page.fill("#id_username", process.env.SCREENER_EMAIL ?? "");
  await page.fill("#id_password", process.env.SCREENER_PASSWORD ?? "");
  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    page.click('button:has-text("Login")'),
  ]);
}

// Tries consolidated then standalone slug; returns the page HTML.
async function fetchCompanyHtml(page: Page, ticker: string): Promise<string> {
  for (const path of [`/company/${ticker}/consolidated/`, `/company/${ticker}/`]) {
    const res = await page.goto(`https://www.screener.in${path}`, { waitUntil: "domcontentloaded" });
    if (res && res.ok()) return page.content();
  }
  throw new Error(`Could not load company page for ${ticker}`);
}

async function downloadPdf(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("pdf") && !url.toLowerCase().includes(".pdf")) {
    throw new Error(`not a pdf (content-type: ${ct})`);
  }
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(destPath));
}

// Keep only the first `perType` links of each type (page lists newest first),
// so a Phase-1 run downloads a handful of PDFs, not the full history.
function capPerType(links: FilingLink[], perType: number): FilingLink[] {
  const counts: Record<FilingType, number> = { presentation: 0, result: 0, annual_report: 0 };
  return links.filter((l) => (counts[l.type]++ < perType));
}

export interface ScrapeResult {
  links: (FilingLink & { local_path: string })[];
}

// Scrapes one company by ticker slug, downloads up to `perType` filing PDFs of
// each type into data/<ticker>/. Failed downloads are skipped with a warning.
export async function scrapeCompany(ticker: string, perType = 2): Promise<ScrapeResult> {
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    await login(page);
    const html = await fetchCompanyHtml(page, ticker);
    const links = capPerType(parseFilingLinks(html), perType);
    const dir = join(dataDir(), ticker);
    await mkdir(dir, { recursive: true });
    const out: ScrapeResult["links"] = [];
    for (const [i, link] of links.entries()) {
      const local_path = join(dir, `${link.type}-${link.period ?? i}.pdf`);
      try {
        await downloadPdf(link.url, local_path);
        out.push({ ...link, local_path });
      } catch (e) {
        console.error(`WARN: couldn't fetch ${link.url}: ${(e as Error).message}`);
      }
    }
    return { links: out };
  } finally {
    await browser?.close();
  }
}
