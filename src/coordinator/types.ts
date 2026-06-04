// One parsed unit of coordinator progress, surfaced to the browser over SSE.
// Kinds match the design spec: step | tool | text | error | done.
export type AgentEvent =
  | { kind: "step"; label: string } // a pipeline step started (pnpm scrape/ingest/extract/verify/db)
  | { kind: "tool"; name: string; summary: string } // any other tool use
  | { kind: "text"; text: string } // assistant narration
  | { kind: "error"; message: string } // run failed
  | { kind: "done"; ok: boolean; summary: string }; // run finished

// A spawned child process, abstracted for testability (mirrors notebooklm's Runner pattern).
// stdout yields raw string chunks (NOT necessarily line-aligned — the consumer buffers).
export interface SpawnedProcess {
  stdout: AsyncIterable<string>;
  exitCode: Promise<number>;
}

// Injectable spawner. Default implementation shells out to the real `claude` binary.
export type Spawner = (cmd: string, args: string[]) => SpawnedProcess;
