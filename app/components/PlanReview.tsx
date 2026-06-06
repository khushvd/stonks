"use client";
import type { AnalystPlan, PeerPlan } from "../../src/planner/plan.js";

export function PlanReview({
  plan,
  onChange,
  disabled,
}: {
  plan: AnalystPlan;
  onChange: (plan: AnalystPlan) => void;
  disabled: boolean;
}) {
  function updatePeer(index: number, patch: Partial<PeerPlan>) {
    const peers = plan.peers.map((peer, i) => (i === index ? { ...peer, ...patch } : peer)) as AnalystPlan["peers"];
    onChange({ ...plan, peers });
  }

  return (
    <section style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 10, margin: "10px 0 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <h2 style={{ fontSize: 12, margin: 0, textTransform: "uppercase", letterSpacing: 0.5 }}>Confirm plan</h2>
        <code style={{ color: "var(--muted)", fontSize: 11 }}>{plan.company.slug}</code>
      </div>

      <p style={{ margin: "8px 0", color: "var(--muted)", fontSize: 12 }}>{plan.sourcePolicy}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {[...plan.focusAreas, ...plan.metrics].map((item) => (
          <span key={item} style={{ border: "1px solid var(--border)", borderRadius: 999, padding: "2px 7px", fontSize: 11 }}>
            {item}
          </span>
        ))}
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {plan.peers.map((peer, index) => (
          <fieldset key={index} style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 8 }}>
            <legend style={{ color: "var(--muted)", fontSize: 11 }}>Peer {index + 1}</legend>
            <input
              aria-label={`Peer ${index + 1} name`}
              value={peer.name}
              onChange={(e) => updatePeer(index, { name: e.target.value })}
              disabled={disabled}
              style={inputStyle}
            />
            <input
              aria-label={`Peer ${index + 1} slug`}
              value={peer.slug}
              onChange={(e) => updatePeer(index, { slug: e.target.value.toUpperCase() })}
              disabled={disabled}
              style={inputStyle}
            />
            <input
              aria-label={`Peer ${index + 1} reason`}
              value={peer.reason}
              onChange={(e) => updatePeer(index, { reason: e.target.value })}
              disabled={disabled}
              style={inputStyle}
            />
          </fieldset>
        ))}
      </div>
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: 6,
  marginTop: 4,
  color: "var(--text)",
};
