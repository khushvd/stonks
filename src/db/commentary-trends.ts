import type Database from "better-sqlite3";

export type CommentaryTone = "cautious" | "neutral" | "optimistic" | "confident";

export interface CommentaryTrend {
  period: string;
  summary: string;
  tone: CommentaryTone;
  keyTopics: string[];
  contradictionNote: string | null;
}

export function insertCommentaryTrends(
  db: Database.Database,
  companyId: number,
  trends: CommentaryTrend[],
): void {
  const del = db.prepare("DELETE FROM commentary_trends WHERE company_id = ?");
  const ins = db.prepare(
    "INSERT INTO commentary_trends (company_id, period, summary, tone, key_topics, contradiction_note) VALUES (?, ?, ?, ?, ?, ?)",
  );
  db.transaction(() => {
    del.run(companyId);
    for (const t of trends) {
      ins.run(companyId, t.period, t.summary, t.tone, JSON.stringify(t.keyTopics), t.contradictionNote ?? null);
    }
  })();
}

export function getCommentaryTrends(db: Database.Database, companyId: number): CommentaryTrend[] {
  const rows = db
    .prepare(
      "SELECT period, summary, tone, key_topics, contradiction_note FROM commentary_trends WHERE company_id = ? ORDER BY id ASC",
    )
    .all(companyId) as {
    period: string;
    summary: string;
    tone: CommentaryTone;
    key_topics: string;
    contradiction_note: string | null;
  }[];
  return rows.map((r) => ({
    period: r.period,
    summary: r.summary,
    tone: r.tone,
    keyTopics: JSON.parse(r.key_topics) as string[],
    contradictionNote: r.contradiction_note,
  }));
}
