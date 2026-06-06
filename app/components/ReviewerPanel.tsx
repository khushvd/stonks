import type { ReviewerFinding } from "../../src/reviewer/review.js";

export function ReviewerPanel({ findings }: { findings: ReviewerFinding[] }) {
  if (findings.length === 0) return null;
  return (
    <section style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 12, margin: "14px 0 18px" }}>
      <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", margin: "0 0 10px" }}>
        Reviewer Findings
      </h2>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {findings.map((finding, index) => (
          <li key={`${finding.kind}-${index}`} style={{ marginBottom: 6, color: finding.severity === "bad" ? "#ff6b6b" : "var(--text)" }}>
            <code style={{ color: "var(--muted)", marginRight: 6 }}>{finding.kind}</code>
            {finding.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
