import { describe, it, expect } from "vitest";
import { nbList, nbCreate, nbSourceAdd, nbSourceWait, nbAsk, type Runner } from "../../src/notebooklm/cli.js";

const ok = (stdout: string): Runner => async () => ({ stdout, stderr: "" });
const fail = (stderr: string): Runner => async () => {
  const e = new Error("Command failed") as Error & { stderr?: string };
  e.stderr = stderr;
  throw e;
};

describe("notebooklm cli wrapper", () => {
  it("nbList parses the notebooks array", async () => {
    const run = ok(JSON.stringify({ notebooks: [{ index: 1, id: "nb1", title: "Asian Paints", is_owner: true }] }));
    const res = await nbList(run);
    expect(res.notebooks[0]).toMatchObject({ id: "nb1", title: "Asian Paints", is_owner: true });
  });

  it("nbCreate unwraps the nested notebook id", async () => {
    const run = ok(JSON.stringify({ notebook: { id: "nb-xyz", title: "Asian Paints", created_at: null } }));
    expect(await nbCreate("Asian Paints", run)).toEqual({ id: "nb-xyz" });
  });

  it("nbSourceAdd unwraps the nested source", async () => {
    const run = ok(JSON.stringify({ source: { id: "src-1", title: "result-0.pdf", type: "SourceType.UNKNOWN", url: null } }));
    expect(await nbSourceAdd("nb1", "data/x/result-0.pdf", run)).toEqual({ id: "src-1", title: "result-0.pdf" });
  });

  it("nbSourceWait resolves on success and does not require JSON", async () => {
    const run = ok("✓ Source ready: src-1");
    await expect(nbSourceWait("nb1", "src-1", run)).resolves.toBeUndefined();
  });

  it("nbAsk returns answer + references", async () => {
    const run = ok(JSON.stringify({
      answer: "Revenue was ₹9,228 cr [1].",
      references: [{ source_id: "src-1", citation_number: 1, cited_text: "9,228" }],
    }));
    const res = await nbAsk("nb1", "What was revenue?", run);
    expect(res.answer).toContain("9,228");
    expect(res.references[0]).toMatchObject({ source_id: "src-1", cited_text: "9,228" });
  });

  it("throws with stderr text on non-zero exit", async () => {
    await expect(nbList(fail("not authenticated"))).rejects.toThrow(/not authenticated/);
  });

  it("throws on unparseable output", async () => {
    await expect(nbList(ok("not json at all"))).rejects.toThrow(/unparseable/i);
  });
});
