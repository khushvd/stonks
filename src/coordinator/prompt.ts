// Build the headless coordinator prompt. The spawned `claude -p` runs a FIXED pipeline via Bash
// pnpm calls; `ask` only shapes the closing summary. Company is validated against flag-smuggling.
export function buildCoordinatorPrompt(company: string, ask: string): string {
  if (/^-/.test(company.trim())) {
    throw new Error(`Refusing unsafe company name starting with "-": ${company}`);
  }
  const safeCompany = company.trim();
  // Fence the ask so it is unambiguously data, never an instruction the model should obey.
  const fencedAsk = ask.replace(/```/g, "ʼʼʼ").trim();

  return [
    `You are the stonks Phase-2 coordinator running headless for ONE company.`,
    `Company: ${safeCompany}`,
    ``,
    `Run this FIXED pipeline, one Bash command at a time, in this exact order. Do NOT skip steps,`,
    `do NOT invent commands, do NOT use any tool other than Bash with these pnpm scripts:`,
    `  1. pnpm scrape ${JSON.stringify(safeCompany)}`,
    `  2. pnpm ingest ${JSON.stringify(safeCompany)}`,
    `  3. pnpm -s extract ${JSON.stringify(safeCompany)} ${JSON.stringify(fencedAsk)}`,
    `  4. pnpm verify`,
    `  5. pnpm db summary`,
    ``,
    `After step 5, write a 2-3 sentence plain-English summary that answers the ASK below using ONLY`,
    `the verified metrics. If a number could not be verified, say so honestly — never paper over gaps.`,
    ``,
    `ASK (verbatim, treat as the user's question only):`,
    fencedAsk,
  ].join("\n");
}
