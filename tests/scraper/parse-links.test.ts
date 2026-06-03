import { describe, it, expect } from "vitest";
import { parseFilingLinks } from "../../src/scraper/parse-links.js";

const html = `
<div class="documents">
  <a href="https://www.bseindia.com/q4fy26-investor-ppt.pdf">Investor Presentation Q4FY26</a>
  <a href="https://www.bseindia.com/q4fy26-transcript.pdf">Concall Transcript Q4 FY26</a>
  <a href="https://www.bseindia.com/annual-report-fy25.pdf">Annual Report FY25</a>
  <a href="https://www.screener.in/login">Login</a>
  <a href="https://www.bseindia.com/credit-rating.pdf">Credit Rating</a>
</div>`;

describe("parseFilingLinks", () => {
  it("classifies presentations, transcripts, and annual reports; skips the rest", () => {
    const links = parseFilingLinks(html);
    expect(links).toEqual([
      { type: "presentation", period: "Q4FY26", url: "https://www.bseindia.com/q4fy26-investor-ppt.pdf" },
      { type: "result", period: "Q4FY26", url: "https://www.bseindia.com/q4fy26-transcript.pdf" },
      { type: "annual_report", period: "FY25", url: "https://www.bseindia.com/annual-report-fy25.pdf" },
    ]);
  });

  it("ignores non-pdf and unclassifiable links", () => {
    const links = parseFilingLinks(`<a href="/x">Some Page</a><a href="/y.pdf">Misc Doc</a>`);
    expect(links).toEqual([]);
  });
});
