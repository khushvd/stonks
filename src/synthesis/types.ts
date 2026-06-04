// One synthesized point in the brief. `cite` indexes into Brief.references by citation_number.
// `metric` is present only when the claim asserts a concrete number (it gets staged for the verifier).
export type ClaimSection = "answer" | "guidance" | "drivers" | "risks" | "industry_kpi";

export interface ClaimMetric {
  name: string;
  value: number;
  unit: string | null;
  period: string | null;
}

export interface Claim {
  text: string;
  section: ClaimSection;
  cite: number | null;
  metric: ClaimMetric | null;
}

// Subset of the notebooklm `NbReference` we persist with the brief, so the dashboard can resolve
// a claim's citation to a source PDF without re-querying NotebookLM.
export interface BriefRef {
  citation_number: number;
  source_id: string;
  cited_text: string;
}

export interface Brief {
  ask: string | null;
  claims: Claim[];
  industryKpis: string[];
  references: BriefRef[];
}
