import { NextResponse } from "next/server";
import { openDb } from "../../../src/db/db.js";
import { getDashboard } from "../../../src/dashboard/data.js";

// better-sqlite3 is sync + native → must run on the Node runtime, never edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const company = new URL(req.url).searchParams.get("company");
  if (!company) return NextResponse.json({ error: "missing ?company" }, { status: 400 });

  const db = openDb();
  try {
    const data = getDashboard(db, company);
    if (!data) return NextResponse.json({ error: `unknown company: ${company}` }, { status: 404 });
    return NextResponse.json(data);
  } finally {
    db.close();
  }
}
