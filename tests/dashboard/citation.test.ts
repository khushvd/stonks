import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCitationHref, resolvePdfPath, buildSourceHref } from "../../src/dashboard/citation.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

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
  it("returns null for an absolute path that resolves outside the project root", () => {
    expect(buildCitationHref("/etc/passwd.pdf", 1)).toBeNull();
  });
});

describe("buildSourceHref", () => {
  it("builds a page-less href for a data/ PDF", () => {
    expect(buildSourceHref("data/acme/q4.pdf")).toBe("/api/pdf?path=data%2Facme%2Fq4.pdf");
  });

  it("returns null for a missing path", () => {
    expect(buildSourceHref(null)).toBeNull();
  });
});

describe("resolvePdfPath", () => {
  const testDir = join(projectRoot, "data", "__citation_test__");
  const testPdf = join(testDir, "sample.pdf");

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("accepts a path inside data/ and returns an absolute path", () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testPdf, "%PDF-1.4 minimal");
    const abs = resolvePdfPath("data/__citation_test__/sample.pdf");
    expect(abs.endsWith("/data/__citation_test__/sample.pdf")).toBe(true);
  });
  it("rejects traversal outside data/", () => {
    expect(() => resolvePdfPath("data/../../etc/passwd")).toThrow(/outside data/i);
    expect(() => resolvePdfPath("/etc/passwd")).toThrow(/outside data/i);
  });
  it("rejects non-pdf files", () => {
    expect(() => resolvePdfPath("data/secrets.env")).toThrow(/not a pdf/i);
  });
  it("rejects percent-encoded input before any filesystem access", () => {
    expect(() => resolvePdfPath("data/%2e%2e/etc/passwd.pdf")).toThrow(/percent-encoded/i);
  });
});
