import type { AgentEvent } from "./types.js";

// Map a Bash command to a pipeline step label, or null if it is not a known pipeline step.
const STEP_RULES: ReadonlyArray<[RegExp, string]> = [
  [/\bpnpm\b.*\bscrape\b/, "Scrape screener"],
  [/\bpnpm\b.*\bingest\b/, "Ingest → NotebookLM"],
  [/\bpnpm\b.*\bextract\b/, "Extract metrics"],
  [/\bpnpm\b.*\bverify\b/, "Verify vs source"],
  [/\bpnpm\b.*\bdb\b/, "Summarize"],
];

export function stepLabelFor(command: string): string | null {
  for (const [re, label] of STEP_RULES) if (re.test(command)) return label;
  return null;
}

interface RawLine {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  message?: { content?: Array<{ type?: string; text?: string; name?: string; input?: { command?: string } }> };
}

// Parse ONE stream-json line into an AgentEvent, or null if the line carries no user-facing progress.
export function parseLine(line: string): AgentEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let o: RawLine;
  try {
    o = JSON.parse(trimmed) as RawLine;
  } catch {
    return null; // partial/non-JSON line — ignore
  }

  if (o.type === "result") {
    if (o.is_error) return { kind: "error", message: o.result ?? "run failed" };
    return { kind: "done", ok: true, summary: o.result ?? "" };
  }

  if (o.type === "assistant") {
    const content = o.message?.content ?? [];
    // A tool_use always wins over narration in the same message: a `pnpm` step must not be
    // dropped just because a text block happened to come first. Stash the first text block and
    // only fall back to it once the loop confirms there is no tool_use.
    let firstText: string | null = null;
    for (const block of content) {
      if (block.type === "tool_use") {
        const cmd = block.input?.command;
        const label = cmd ? stepLabelFor(cmd) : null;
        if (label) return { kind: "step", label };
        return { kind: "tool", name: block.name ?? "tool", summary: block.name ?? "tool" };
      }
      if (firstText === null && block.type === "text" && block.text) {
        firstText = block.text;
      }
    }
    if (firstText !== null) return { kind: "text", text: firstText };
    return null;
  }

  // system (init/hook), user (tool_result), anything else → ignore
  return null;
}
