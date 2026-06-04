import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLine, stepLabelFor } from "../../src/coordinator/stream.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFileSync(join(here, "..", "fixtures", "stream-json", name), "utf8");

describe("stepLabelFor", () => {
  it("maps each pnpm pipeline command to a human step label", () => {
    expect(stepLabelFor("pnpm scrape 'Asian Paints'")).toBe("Scrape screener");
    expect(stepLabelFor("pnpm ingest 'Asian Paints'")).toBe("Ingest → NotebookLM");
    expect(stepLabelFor("pnpm -s extract 'Asian Paints' 'margins'")).toBe("Extract metrics");
    expect(stepLabelFor("pnpm verify")).toBe("Verify vs source");
    expect(stepLabelFor("pnpm db summary")).toBe("Summarize");
  });
  it("returns null for non-pipeline commands", () => {
    expect(stepLabelFor("ls -la")).toBeNull();
  });
});

describe("parseLine", () => {
  it("ignores hook + user + init + blank lines (returns null)", () => {
    expect(parseLine("")).toBeNull();
    expect(parseLine("not json")).toBeNull();
    expect(parseLine(JSON.stringify({ type: "system", subtype: "hook_started" }))).toBeNull();
    expect(parseLine(JSON.stringify({ type: "system", subtype: "init", model: "claude-sonnet" }))).toBeNull();
    expect(parseLine(JSON.stringify({ type: "user", message: { content: [] } }))).toBeNull();
  });

  it("parses an assistant text line", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "Scraping now." }] },
    });
    expect(parseLine(line)).toEqual({ kind: "text", text: "Scraping now." });
  });

  it("parses a pnpm tool_use into a step event", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "tool_use", name: "Bash", input: { command: "pnpm verify" } }] },
    });
    expect(parseLine(line)).toEqual({ kind: "step", label: "Verify vs source" });
  });

  it("parses a non-pnpm tool_use into a tool event", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/x.pdf" } }] },
    });
    expect(parseLine(line)).toEqual({ kind: "tool", name: "Read", summary: "Read" });
  });

  it("lets a tool_use win over a preceding text block in the same message", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Now verifying." },
          { type: "tool_use", name: "Bash", input: { command: "pnpm verify" } },
        ],
      },
    });
    expect(parseLine(line)).toEqual({ kind: "step", label: "Verify vs source" });
  });

  it("lets a tool_use win when it precedes a text block too", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", name: "Bash", input: { command: "pnpm verify" } },
          { type: "text", text: "Now verifying." },
        ],
      },
    });
    expect(parseLine(line)).toEqual({ kind: "step", label: "Verify vs source" });
  });

  it("parses a success result into a done event", () => {
    const line = JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "3 verified metrics." });
    expect(parseLine(line)).toEqual({ kind: "done", ok: true, summary: "3 verified metrics." });
  });

  it("parses an error result into an error event", () => {
    const line = JSON.stringify({ type: "result", subtype: "error_during_execution", is_error: true, result: "boom" });
    expect(parseLine(line)).toEqual({ kind: "error", message: "boom" });
  });

  it("every line of the real happy-path fixture parses without throwing", () => {
    const lines = fixture("hello.jsonl").split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    let sawDone = false;
    for (const l of lines) {
      const ev = parseLine(l); // must never throw
      if (ev?.kind === "done") sawDone = true;
    }
    expect(sawDone).toBe(true);
  });
});
