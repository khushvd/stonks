import { NextResponse } from "next/server";
import { openDb } from "../../../src/db/db.js";
import { getDashboard } from "../../../src/dashboard/data.js";
import { getComparisonData } from "../../../src/dashboard/comparison.js";

// better-sqlite3 is sync + native → must run on the Node runtime, never edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const url = new URL(req.url);
  const company = url.searchParams.get("company");
  if (!company) return NextResponse.json({ error: "missing ?company" }, { status: 400 });

  const db = openDb();
  try {
    const data = getDashboard(db, company);
    if (!data) return NextResponse.json({ error: `unknown company: ${company}` }, { status: 404 });

    // Load peer companies from ?peers= param (comma-separated company names) for benchmarking.
    const peersParam = url.searchParams.get("peers");
    const peerNames = peersParam ? peersParam.split(",").map((n) => n.trim()).filter(Boolean) : [];
    const companyNames = [company, ...peerNames.filter((p) => p !== company)];
    const comparison = companyNames.length > 1 ? getComparisonData(db, companyNames) : null;

    return NextResponse.json({ ...data, comparison });
  } finally {
    db.close();
  }
}
