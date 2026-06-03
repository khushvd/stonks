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
  source_page INTEGER
);

CREATE TABLE IF NOT EXISTS metrics_staging (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filing_id INTEGER NOT NULL REFERENCES filings(id),
  name TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT,
  period TEXT,
  source_page INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','rejected')),
  reject_reason TEXT
);
