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
  notebooklm_source_id: string | null;
}

export type Trust = "verified" | "notebooklm-only";

export interface MetricInput {
  filing_id: number;
  name: string;
  value: number;
  unit: string | null;
  period: string | null;
  source_page: number | null;
  excerpt: string | null;
  source_url: string | null;
  notebooklm_source_id?: string | null;
}

export interface Metric {
  id: number;
  filing_id: number;
  name: string;
  value: number;
  unit: string | null;
  period: string | null;
  source_page: number | null;
  trust: Trust;
}

export interface StagedMetric extends MetricInput {
  id: number;
  status: "pending" | "rejected";
  reject_reason: string | null;
}

export interface IntegritySummary {
  verified: number;
  notebooklmOnly: number;
  pending: number;
  rejected: number;
}

export interface Notebook {
  company_id: number;
  notebook_url: string | null;
  notebook_id: string | null;
}

export interface IndustryMetric {
  industry: string;
  metric_key: string;
  label: string | null;
  source: "notebooklm" | "sonnet";
}

export interface PageText {
  page: number;
  text: string;
}
