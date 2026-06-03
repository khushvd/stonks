export type FilingType = "presentation" | "result" | "annual_report";

export interface FilingLink {
  type: FilingType;
  period: string | null;
  url: string;
}

export interface Company {
  id: number;
  name: string;
  ticker: string | null;
  industry: string | null;
}

export interface Filing {
  id: number;
  company_id: number;
  type: FilingType;
  period: string | null;
  source_url: string | null;
  local_path: string | null;
}

export interface MetricInput {
  filing_id: number;
  name: string;
  value: number;
  unit: string | null;
  period: string | null;
  source_page: number | null;
}

export interface Metric extends MetricInput {
  id: number;
}

export interface StagedMetric extends Metric {
  status: "pending" | "rejected";
  reject_reason: string | null;
}

export interface IntegritySummary {
  verified: number;
  pending: number;
  rejected: number;
}

export interface PageText {
  page: number;
  text: string;
}
