import { describe, expect, it } from "vitest";
import { readAgentEventStream } from "../../app/components/ControlRail.js";
import type { AgentEvent } from "../../src/coordinator/types.js";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("readAgentEventStream", () => {
  it("reads split SSE frames and reports persisted run events", async () => {
    const events: AgentEvent[] = [];
    const runIds: number[] = [];
    const stream = streamFromChunks([
      'data: {"kind":"run","runId":12,',
      '"status":"running"}\n\n',
      'data: {"kind":"done","ok":true,"summary":"complete"}\n\n',
    ]);

    await readAgentEventStream(stream, {
      onEvent: (event) => events.push(event),
      onRunId: (runId) => runIds.push(runId),
    });

    expect(runIds).toEqual([12]);
    expect(events).toEqual([
      { kind: "run", runId: 12, status: "running" },
      { kind: "done", ok: true, summary: "complete" },
    ]);
  });
});
