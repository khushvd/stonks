import { NextResponse } from "next/server";
import { listAnalysisRuns } from "../../../src/db/analysis-runs.js";
import { openDb } from "../../../src/db/db.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = openDb();
  try {
    return NextResponse.json({ runs: listAnalysisRuns(db, 20) });
  } finally {
    db.close();
  }
}
