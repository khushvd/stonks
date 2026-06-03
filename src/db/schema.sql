CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  ticker TEXT,
  industry TEXT
);

CREATE TABLE IF NOT EXISTS filings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  type TEXT NOT NULL CHECK(type IN ('presentation','result','annual_report')),
  period TEXT,
  source_url TEXT,
  local_path TEXT,
  UNIQUE(company_id, type, period, source_url)
);

CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filing_id INTEGER NOT NULL REFERENCES filings(id),
  name TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT,
  period TEXT,
  source_page INTEGER,
  trust TEXT NOT NULL DEFAULT 'verified' CHECK(trust IN ('verified','notebooklm-only'))
);

CREATE TABLE IF NOT EXISTS metrics_staging (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filing_id INTEGER NOT NULL REFERENCES filings(id),
  name TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT,
  period TEXT,
  source_page INTEGER,
  excerpt TEXT,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','rejected')),
  reject_reason TEXT
);

CREATE TABLE IF NOT EXISTS notebooks (
  company_id INTEGER PRIMARY KEY REFERENCES companies(id),
  notebook_url TEXT,
  notebook_id TEXT
);

CREATE TABLE IF NOT EXISTS industry_metrics (
  industry TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  label TEXT,
  source TEXT NOT NULL CHECK(source IN ('notebooklm','sonnet')),
  PRIMARY KEY (industry, metric_key)
);
