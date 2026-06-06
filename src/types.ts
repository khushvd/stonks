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

export type Trust = "verified" | "notebooklm-only" | "screener";

export interface MetricInput {
  filing_id: number | null;
  company_id?: number | null;
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
  filing_id: number | null;
  company_id: number | null;
  name: string;
  value: number;
  unit: string | null;
  period: string | null;
  source_page: number | null;
  trust: Trust;
}

// StagedMetric always has a non-null filing_id (the staging table enforces NOT NULL).
export interface StagedMetric extends Omit<MetricInput, "filing_id"> {
  id: number;
  filing_id: number;
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
  unit?: string | null;
  description?: string | null;
  priority?: number | null;
  source: "notebooklm" | "sonnet";
}

export type KpiStatus = "missing" | "failed";

export interface CompanyKpiStatus {
  company_id: number;
  metric_key: string;
  label: string | null;
  unit: string | null;
  status: KpiStatus;
  missing_reason: string | null;
  updated_at: string;
}

export interface PageText {
  page: number;
  text: string;
}
