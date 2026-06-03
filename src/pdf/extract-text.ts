import { readFile } from "node:fs/promises";
import type { PageText } from "../types.js";
// pdfjs legacy build works in Node without a DOM.
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export async function extractPageText(path: string): Promise<PageText[]> {
  const data = new Uint8Array(await readFile(path));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const out: PageText[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ");
    out.push({ page: p, text });
  }
  return out;
}
