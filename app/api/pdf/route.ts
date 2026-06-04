import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { resolvePdfPath } from "../../../src/dashboard/citation.js";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("path");
  if (!raw) return NextResponse.json({ error: "missing ?path" }, { status: 400 });

  let abs: string;
  try {
    abs = resolvePdfPath(raw); // throws on traversal / non-pdf
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  try {
    const bytes = await readFile(abs);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline" },
    });
  } catch {
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  }
}
