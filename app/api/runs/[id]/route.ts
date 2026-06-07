import { NextResponse } from "next/server";
import { getAnalysisRun } from "../../../../src/db/analysis-runs.js";
import { openDb } from "../../../../src/db/db.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: `invalid run id: ${rawId}` }, { status: 400 });
  }

  const db = openDb();
  try {
    const run = getAnalysisRun(db, id);
    if (!run) {
      return NextResponse.json({ error: `unknown run: ${id}` }, { status: 404 });
    }
    return NextResponse.json({ run });
  } finally {
    db.close();
  }
}
