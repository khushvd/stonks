import type { BriefView, BriefClaimView } from "../../src/dashboard/data.js";

const SECTION_TITLES: Record<BriefClaimView["section"], string> = {
  answer: "Answer",
  guidance: "Guidance",
  drivers: "What moved the numbers",
  risks: "Risks & red flags",
  industry_kpi: "Industry KPIs",
};
const SECTION_ORDER: BriefClaimView["section"][] = ["answer", "guidance", "drivers", "risks", "industry_kpi"];

function ClaimLine({ claim }: { claim: BriefClaimView }) {
  // Only allow relative paths and http(s) URLs — block javascript: and other dangerous schemes.
  const safeHref = claim.sourceHref && /^(https?:|\/)/i.test(claim.sourceHref) ? claim.sourceHref : null;
  return (
    <li style={{ marginBottom: 8, lineHeight: 1.45 }}>
      <span>{claim.text}</span>
      {claim.metric && (
        <span
          style={{ marginLeft: 8, padding: "1px 6px", borderRadius: 4, fontSize: 11, fontWeight: 700, color: "#000", background: claim.metric.badge.color }}
        >
          {claim.metric.badge.label}
        </span>
      )}
      {safeHref && (
        <a href={safeHref} target="_blank" rel="noreferrer" style={{ marginLeft: 8, fontSize: 12, color: "var(--muted)" }}>
          source
        </a>
      )}
    </li>
  );
}

export function BriefPanel({ brief }: { brief: BriefView | null }) {
  if (!brief || brief.claims.length === 0) {
    return (
      <section style={{ marginBottom: 24 }}>
        <p style={{ color: "var(--muted)" }}>Couldn&apos;t synthesize a brief — the sources may still be indexing. Try running again shortly.</p>
      </section>
    );
  }
  return (
    <section style={{ marginBottom: 28 }}>
      {brief.ask && <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>Ask: {brief.ask}</div>}
      {SECTION_ORDER.map((section) => {
        const claims = brief.claims.filter((c) => c.section === section);
        if (claims.length === 0) return null;
        return (
          <div key={section} style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--muted)", marginBottom: 6 }}>
              {SECTION_TITLES[section]}
            </h3>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {claims.map((c, i) => (
                <ClaimLine key={i} claim={c} />
              ))}
            </ul>
          </div>
        );
      })}
      {brief.industryKpis.length > 0 && (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Industry KPIs tracked: {brief.industryKpis.join(", ")}</div>
      )}
    </section>
  );
}
