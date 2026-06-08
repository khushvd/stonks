import type { BriefingData } from "./types";

const MOCK_BRIEFING: BriefingData = {
  company: {
    name: "Indian Hotels Co.",
    ticker: "INDHOTEL",
    industry: "Hospitality · Hotels",
    sector: "Hotels",
    asOf: "Q4 FY25 · reported 30 Apr 2025",
  },
  ask: "How have margins trended over the last few quarters?",
  about: "India's largest hospitality company (the Taj, SeleQtions, Vivanta, Ginger brands) — ~25,200 keys across luxury to economy, increasingly asset-light via management contracts. Listed, Tata group.",
  bottomLine: {
    worth: "Structural margin expansion (+8 pts/2yr) backed by pricing power and a richer asset-light mix — the trend is real, not a cyclical blip.",
    watch: "One management contradiction in Q4 (supply-driven ARR caution vs Q3's confidence) and one quarantined peer figure. Worth a closer look before sizing.",
  },
  brief: {
    headline: "EBITDA margin has expanded ~8 pts over two years, from ~28% (Q1 FY24) to ~36% (Q4 FY25), with sharp seasonal peaks every Q3.",
    answer: [
      "Consolidated EBITDA margin climbed from 28.5% in Q1 FY24 to 36.0% in Q4 FY25 — a structural step-up, not a one-off.",
      "The pattern is strongly seasonal: festive/wedding-heavy Q3 prints the year's peak (39.5% in Q3 FY25), monsoon-hit Q1 the trough.",
    ],
    drivers: [
      { text: "ARR up 11% YoY to ₹13,420; pricing power held even as occupancy normalised at 76%.", metric: "ARR ₹13,420" },
      { text: "Operating leverage on a largely fixed cost base — every incremental RevPAR rupee drops through.", metric: null },
      { text: "Asset-light management-fee income grew 28% YoY, a higher-margin revenue mix.", metric: "+28% YoY" },
    ],
    guidance: [
      { text: "Management reiterates a sustained 33–35% consolidated margin band through FY26.", metric: "33–35%" },
      { text: "Double-digit revenue growth guided, led by new luxury & Ginger keys.", metric: null },
    ],
    risks: [
      { text: "Q1 monsoon seasonality keeps margins structurally lowest in the June quarter.", tone: "neutral" },
      { text: "Supply additions in Mumbai & Bengaluru could pressure ARR from FY27.", tone: "cautious" },
    ],
  },
  quarters: [
    { period: "Q1FY24", label: "Jun'23", margin: 28.5, rev: 1485, ebitda: 423, pat: 205 },
    { period: "Q2FY24", label: "Sep'23", margin: 27.0, rev: 1480, ebitda: 400, pat: 167 },
    { period: "Q3FY24", label: "Dec'23", margin: 38.0, rev: 2012, ebitda: 765, pat: 452 },
    { period: "Q4FY24", label: "Mar'24", margin: 34.5, rev: 1905, ebitda: 657, pat: 418 },
    { period: "Q1FY25", label: "Jun'24", margin: 30.0, rev: 1597, ebitda: 479, pat: 248 },
    { period: "Q2FY25", label: "Sep'24", margin: 29.5, rev: 1891, ebitda: 558, pat: 583 },
    { period: "Q3FY25", label: "Dec'24", margin: 39.5, rev: 2533, ebitda: 1001, pat: 582 },
    { period: "Q4FY25", label: "Mar'25", margin: 36.0, rev: 2425, ebitda: 873, pat: 522 },
  ],
  stats: [
    { key: "EBITDA margin", value: "36.0%", delta: "+1.5 pts", dir: "up", sub: "vs 34.5% Q4FY24" },
    { key: "Revenue", value: "₹2,425 cr", delta: "+27.3%", dir: "up", sub: "YoY, Q4FY25" },
    { key: "EBITDA", value: "₹873 cr", delta: "+32.9%", dir: "up", sub: "YoY, Q4FY25" },
    { key: "PAT", value: "₹522 cr", delta: "+24.9%", dir: "up", sub: "YoY, Q4FY25" },
  ],
  peers: ["INDHOTEL", "EIH", "CHALET", "LEMONTREE", "ITCHOTELS", "SAMHI"],
  matrix: [
    {
      kpi: "Revenue", unit: "₹cr", fmt: "int", spark: "rev",
      cells: { INDHOTEL: 8565, EIH: 2742, CHALET: 1710, LEMONTREE: 1210, ITCHOTELS: 3560, SAMHI: 1095 },
    },
    {
      kpi: "EBITDA margin", unit: "%", fmt: "pct", spark: "margin",
      cells: { INDHOTEL: 35.2, EIH: 38.4, CHALET: 42.1, LEMONTREE: 46.3, ITCHOTELS: 35.0, SAMHI: { v: 33.5, trust: "rejected", note: "Unit mismatch — deck reported margin on standalone, not consol. Quarantined." } },
    },
    {
      kpi: "ARR", unit: "₹", fmt: "int", spark: null,
      cells: { INDHOTEL: 13420, EIH: 17800, CHALET: 11250, LEMONTREE: 6450, ITCHOTELS: 14100, SAMHI: { v: 8900, trust: "nlm", note: "From Q4 investor deck p.14 — not yet cross-checked against the result PDF." } },
    },
    {
      kpi: "Occupancy", unit: "%", fmt: "pct", spark: null,
      cells: { INDHOTEL: 76, EIH: 72, CHALET: 74, LEMONTREE: 71, ITCHOTELS: 70, SAMHI: 73 },
    },
    {
      kpi: "RevPAR", unit: "₹", fmt: "int", spark: null,
      cells: { INDHOTEL: 10199, EIH: 12816, CHALET: 8325, LEMONTREE: 4580, ITCHOTELS: { v: null, trust: "missing", note: "Not disclosed in FY25 deck — flagged as follow-up." }, SAMHI: 6497 },
    },
    {
      kpi: "Keys", unit: "rooms", fmt: "int", spark: null,
      cells: { INDHOTEL: 25200, EIH: 4600, CHALET: 3154, LEMONTREE: 10500, ITCHOTELS: 13400, SAMHI: 4801 },
    },
  ],
  peerMargins: {
    INDHOTEL: [27.0, 38.0, 34.5, 30.0, 39.5, 36.0],
    EIH: [33.0, 41.0, 37.5, 34.0, 42.0, 38.4],
    CHALET: [38.0, 44.0, 41.0, 39.0, 45.0, 42.1],
    LEMONTREE: [44.0, 48.0, 46.0, 43.0, 49.0, 46.3],
    ITCHOTELS: [31.0, 38.0, 35.5, 32.0, 39.0, 35.0],
    SAMHI: [28.0, 35.0, 33.0, 30.0, 36.0, 33.5],
  },
  commentary: [
    {
      period: "Q1 FY25", tone: "neutral",
      summary: "Monsoon-driven softness flagged; management framed it as the expected seasonal trough and held full-year guidance.",
      topics: ["seasonality", "guidance held"], flag: null,
    },
    {
      period: "Q2 FY25", tone: "optimistic",
      summary: "Festive bookings 'pacing well ahead of last year'; ARR momentum described as durable into H2.",
      topics: ["ARR", "festive demand"], flag: null,
    },
    {
      period: "Q3 FY25", tone: "confident",
      summary: "Record quarter. 'No signs of demand moderation'; pipeline of 70+ hotels reaffirmed; margin guidance nudged up.",
      topics: ["record qtr", "pipeline", "margin"], flag: null,
    },
    {
      period: "Q4 FY25", tone: "cautious",
      summary: "Noted 'some supply coming into Mumbai' that could temper ARR — a softer read than Q3's 'no moderation' stance.",
      topics: ["supply risk", "ARR"],
      flag: "Contradicts Q3 FY25: management moved from 'no signs of demand moderation' to flagging supply-driven ARR pressure within one quarter.",
    },
  ],
  sources: [
    { type: "RESULT", label: "Q4 FY26 result", page: 3 },
    { type: "DECK", label: "Investor presentation FY25", page: 14 },
    { type: "AR", label: "Annual report FY25", page: 112 },
    { type: "CONCALL", label: "Q4 FY25 earnings call", page: 8 },
  ],
  integrity: { verified: 47, nlmOnly: 3, pending: 2, rejected: 1 },
};

export { MOCK_BRIEFING };
