import { describe, expect, it } from "vitest";
import { parseScrapeArgs, resolveCompany } from "../../src/scraper/company-resolver.js";

describe("resolveCompany", () => {
  it("maps Asian Paints company-name input to the Screener slug ASIANPAINT", () => {
    expect(resolveCompany({ name: "Asian Paints" })).toEqual({
      name: "Asian Paints",
      slug: "ASIANPAINT",
    });
  });

  it("keeps an explicit slug separate from the display name", () => {
    expect(resolveCompany({ name: "Asian Paints", slug: "ASIANPAINT" })).toEqual({
      name: "Asian Paints",
      slug: "ASIANPAINT",
    });
  });

  it("maps SAMHI Hotels Ltd to the live Screener slug SAMHI", () => {
    expect(resolveCompany({ name: "SAMHI Hotels Ltd" })).toEqual({
      name: "SAMHI Hotels Ltd",
      slug: "SAMHI",
    });
  });

  it("falls back to a Screener-style uppercase alphanumeric slug for unknown names", () => {
    expect(resolveCompany({ name: "Example Industries Ltd." })).toEqual({
      name: "Example Industries Ltd.",
      slug: "EXAMPLEINDUSTRIESLTD",
    });
  });
});

describe("parseScrapeArgs", () => {
  it("accepts explicit --name and --slug flags", () => {
    expect(parseScrapeArgs(["--name", "Asian Paints", "--slug", "ASIANPAINT", "--annual"])).toEqual({
      includeAnnualReports: true,
      perType: undefined,
      company: { name: "Asian Paints", slug: "ASIANPAINT" },
    });
  });

  it("accepts --per-type for bounded notebook source scope", () => {
    expect(parseScrapeArgs(["--name", "SAMHI Hotels", "--slug", "SAMHI", "--annual", "--per-type", "4"])).toEqual({
      includeAnnualReports: true,
      perType: 4,
      company: { name: "SAMHI Hotels", slug: "SAMHI" },
    });
  });

  it("treats a single company-name argument as a name, not a slug", () => {
    expect(parseScrapeArgs(["Asian Paints"])).toEqual({
      includeAnnualReports: false,
      perType: undefined,
      company: { name: "Asian Paints", slug: "ASIANPAINT" },
    });
  });
});
