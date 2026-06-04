import { describe, it, expect } from "vitest";
import { buildCitationHref, resolvePdfPath } from "../../src/dashboard/citation.js";

describe("buildCitationHref", () => {
  it("returns null when there is no path or no page", () => {
    expect(buildCitationHref(null, 28)).toBeNull();
    expect(buildCitationHref("data/x.pdf", null)).toBeNull();
  });
  it("builds an /api/pdf href with an encoded path and page fragment", () => {
    expect(buildCitationHref("data/asian-paints/result-0.pdf", 28)).toBe(
      "/api/pdf?path=data%2Fasian-paints%2Fresult-0.pdf#page=28",
    );
  });
});

describe("resolvePdfPath", () => {
  it("accepts a path inside data/ and returns an absolute path", () => {
    const abs = resolvePdfPath("data/asian-paints/result-0.pdf");
    expect(abs.endsWith("/data/asian-paints/result-0.pdf")).toBe(true);
  });
  it("rejects traversal outside data/", () => {
    expect(() => resolvePdfPath("data/../../etc/passwd")).toThrow(/outside data/i);
    expect(() => resolvePdfPath("/etc/passwd")).toThrow(/outside data/i);
  });
  it("rejects non-pdf files", () => {
    expect(() => resolvePdfPath("data/secrets.env")).toThrow(/not a pdf/i);
  });
});
