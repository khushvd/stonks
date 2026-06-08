// briefing.jsx — app shell: chapter rail, progress bar, scroll-spy, keyboard nav, entrance anim.
const { useState: useStateApp, useEffect: useEffectApp, useRef: useRefApp } = React;

const CHAPTERS = [
  { id: "overview", num: 1, label: "Overview" },
  { id: "margins", num: 2, label: "Margins" },
  { id: "financials", num: 3, label: "Financials" },
  { id: "peers", num: 4, label: "Peers" },
  { id: "management", num: 5, label: "Management", flag: "var(--warn)" },
  { id: "risks", num: 6, label: "Risks" },
  { id: "sources", num: 7, label: "Provenance" },
];

function BriefingApp() {
  const scrollRef = useRefApp(null);
  const [active, setActive] = useStateApp(0);
  const [pct, setPct] = useStateApp(0);

  // scroll-spy + progress + entrance animation (document-level scroll)
  useEffectApp(() => {
    const root = scrollRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) root.classList.add("anim");

    const sections = Array.from(root.querySelectorAll(".chapter"));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in-view");
          const idx = sections.indexOf(e.target);
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

  const jump = (idx) => {
    const root = scrollRef.current;
    const sections = Array.from(root.querySelectorAll(".chapter"));
    const target = sections[idx];
    if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY, behavior: "smooth" });
  };

  // keyboard nav
  useEffectApp(() => {
    const onKey = (e) => {
      if (["ArrowDown", "PageDown", " "].includes(e.key)) {
        if (e.target.closest && e.target.closest("button, a, input, textarea")) return;
        e.preventDefault(); jump(Math.min(active + 1, CHAPTERS.length - 1));
      } else if (["ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault(); jump(Math.max(active - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  const { ChOverview, ChMargins, ChFinancials } = window.StonksChapters;
  const { ChPeers, ChManagement, ChRisks, ChSources } = window.StonksChapters2;

  return (
    <React.Fragment>
      <div className="progress-bar" style={{ width: pct + "%" }}></div>

      <nav className="rail">
        <div className="rail-brand">
          <span className="rail-dot"></span>
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
              {c.flag && <span className="flag-dot" style={{ background: c.flag }}></span>}
            </button>
          ))}
        </div>
        <div className="rail-foot">
          {STONKS.company.ticker}<br />
          {STONKS.company.asOf}
        </div>
      </nav>

      <div className="briefing" ref={scrollRef}>
        <div className="chapters">
          <ChOverview />
          <ChMargins />
          <ChFinancials />
          <ChPeers />
          <ChManagement />
          <ChRisks />
          <ChSources />
        </div>
      </div>
    </React.Fragment>
  );
}

window.BriefingApp = BriefingApp;
