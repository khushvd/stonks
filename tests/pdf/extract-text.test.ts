import { describe, it, expect } from "vitest";
import { extractPageText } from "../../src/pdf/extract-text.js";

describe("extractPageText", () => {
  it("returns one entry per page with its text", async () => {
    const pages = await extractPageText("tests/fixtures/sample.pdf");
    expect(pages).toHaveLength(1);
    expect(pages[0].page).toBe(1);
    expect(pages[0].text).toContain("Revenue 1000 cr");
  });
});
