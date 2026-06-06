import { NextResponse } from "next/server";
import { runPlanner } from "../../../src/planner/run.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { company?: string; ask?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const company = (body.company ?? "").trim();
  const ask = (body.ask ?? "").trim();
  if (!company) return NextResponse.json({ error: "missing company" }, { status: 400 });

  try {
    const plan = await runPlanner(company, ask);
    return NextResponse.json({ plan });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
