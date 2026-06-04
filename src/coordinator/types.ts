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
  // Collected stderr, resolved on close. Used to surface startup/auth crashes in the error message.
  // Optional so lightweight fakes (tests) can omit it.
  stderr?: Promise<string>;
  // Terminate the process. Called when the consumer aborts (e.g. the SSE client disconnects) so a
  // headless `claude` run does not keep billing after nobody is listening. Optional for fakes.
  kill?: () => void;
}

// Injectable spawner. Default implementation shells out to the real `claude` binary.
export type Spawner = (cmd: string, args: string[]) => SpawnedProcess;
