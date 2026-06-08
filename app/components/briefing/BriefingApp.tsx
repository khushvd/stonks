"use client";
import { useState, useEffect, useRef } from "react";
import type { BriefingData } from "./types";
import Overview from "./chapters/Overview";
import Margins from "./chapters/Margins";
import Financials from "./chapters/Financials";
import Peers from "./chapters/Peers";
import Management from "./chapters/Management";
import Risks from "./chapters/Risks";
import Provenance from "./chapters/Provenance";

const CHAPTERS = [
  { id: "overview", num: 1, label: "Overview" },
  { id: "margins", num: 2, label: "Margins" },
  { id: "financials", num: 3, label: "Financials" },
  { id: "peers", num: 4, label: "Peers" },
  { id: "management", num: 5, label: "Management", flag: "var(--warn)" },
  { id: "risks", num: 6, label: "Risks" },
  { id: "sources", num: 7, label: "Provenance" },
];

export default function BriefingApp({ data, onExit }: { data: BriefingData; onExit?: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) root.classList.add("anim");

    const sections = Array.from(root.querySelectorAll(".chapter"));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in-view");
          const idx = sections.indexOf(e.target as Element);
          if (idx >= 0) setActive(idx);
        }
      });
    }, { threshold: 0.45 });
    sections.forEach((s) => io.observe(s));

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setPct(max > 0 ? (window.scrollY / max) * 100 : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, []);

  const jump = (idx: number) => {
    const root = scrollRef.current;
    if (!root) return;
    const sections = Array.from(root.querySelectorAll(".chapter"));
    const target = sections[idx] as HTMLElement | undefined;
    if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY, behavior: "smooth" });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowDown", "PageDown", " "].includes(e.key)) {
        if ((e.target as Element)?.closest?.("button, a, input, textarea")) return;
        e.preventDefault();
        jump(Math.min(active + 1, CHAPTERS.length - 1));
      } else if (["ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        jump(Math.max(active - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  return (
    <>
      <div className="progress-bar" style={{ width: pct + "%" }} />

      <nav className="rail">
        <div className="rail-brand">
          <span className="rail-dot" />
          <div>
            <b>stonks</b><br />
            <span>bounded analyst</span>
          </div>
        </div>
        <div className="rail-nav">
          {CHAPTERS.map((c, i) => (
            <button key={c.id} className={"rail-item" + (active === i ? " active" : "")} onClick={() => jump(i)}>
              <span className="num">{String(c.num).padStart(2, "0")}</span>
              <span>{c.label}</span>
              {c.flag && <span className="flag-dot" style={{ background: c.flag }} />}
            </button>
          ))}
        </div>
        <div className="rail-foot">
          {data.company.ticker}<br />
          {data.company.asOf}
          {onExit && (
            <button onClick={onExit} style={{
              display: "block", marginTop: 10, background: "none", border: "1px solid var(--border)",
              color: "var(--muted)", borderRadius: 6, padding: "5px 10px", fontSize: 10,
              fontFamily: "var(--mono)", cursor: "pointer", width: "100%", textAlign: "left",
            }}>← new analysis</button>
          )}
        </div>
      </nav>

      <div className="briefing" ref={scrollRef}>
        <div className="chapters">
          <Overview data={data} />
          <Margins data={data} />
          <Financials data={data} />
          <Peers data={data} />
          <Management data={data} />
          <Risks data={data} />
          <Provenance data={data} />
        </div>
      </div>
    </>
  );
}
