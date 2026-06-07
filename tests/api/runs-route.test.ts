import { beforeEach, describe, expect, it, vi } from "vitest";

const summaries = [
  {
    id: 2,
    companyName: "Asian Paints",
    ask: "compare margins",
    status: "failed",
    failedStepId: "peer-kpis",
    errorMessage: "failed",
    createdAt: "2026-06-07T00:00:00.000Z",
    updatedAt: "2026-06-07T00:01:00.000Z",
    completedAt: null,
    peers: ["Berger Paints", "Kansai Nerolac", "Indigo Paints"],
  },
];

const detail = {
  ...summaries[0],
  plan: {
    company: { name: "Asian Paints", slug: "ASIANPAINT" },
    focusAreas: ["margins"],
    sourcePolicy: "latest filings",
    metrics: ["opm_pct"],
    peers: [
      { name: "Berger Paints", slug: "BERGEPAINT", reason: "direct peer" },
      { name: "Kansai Nerolac", slug: "KANSAINER", reason: "paint peer" },
      { name: "Indigo Paints", slug: "INDIGOPNTS", reason: "listed peer" },
    ],
    notebookQuestions: ["How have margins moved?"],
  },
  steps: [{ stepId: "peer-kpis", label: "Extract peer sector KPI pack", status: "failed" }],
};

const mocks = vi.hoisted(() => {
  const db = { close: vi.fn() };
  return {
    db,
    openDb: vi.fn(() => db),
    listAnalysisRuns: vi.fn(),
    getAnalysisRun: vi.fn(),
  };
});

vi.mock("../../src/db/db.js", () => ({
  openDb: mocks.openDb,
}));

vi.mock("../../src/db/analysis-runs.js", () => ({
  listAnalysisRuns: mocks.listAnalysisRuns,
  getAnalysisRun: mocks.getAnalysisRun,
}));

const runsRoute = await import("../../app/api/runs/route.js");
const runDetailRoute = await import("../../app/api/runs/[id]/route.js");

describe("/api/runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openDb.mockReturnValue(mocks.db);
    mocks.listAnalysisRuns.mockReturnValue(summaries);
    mocks.getAnalysisRun.mockImplementation((_db, id: number) => (id === 2 ? detail : null));
  });

  it("lists saved analysis runs", async () => {
    const res = await runsRoute.GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ runs: summaries });
    expect(mocks.listAnalysisRuns).toHaveBeenCalledWith(mocks.db, 20);
    expect(mocks.db.close).toHaveBeenCalledOnce();
  });

  it("gets a saved analysis run by id", async () => {
    const res = await runDetailRoute.GET(new Request("http://localhost/api/runs/2"), {
      params: Promise.resolve({ id: "2" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ run: detail });
    expect(mocks.getAnalysisRun).toHaveBeenCalledWith(mocks.db, 2);
    expect(mocks.db.close).toHaveBeenCalledOnce();
  });

  it("returns 404 for an unknown analysis run id", async () => {
    const res = await runDetailRoute.GET(new Request("http://localhost/api/runs/999"), {
      params: Promise.resolve({ id: "999" }),
    });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "unknown run: 999" });
    expect(mocks.db.close).toHaveBeenCalledOnce();
  });
});
