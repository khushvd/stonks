import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const BIN = process.env.NOTEBOOKLM_BIN ?? "notebooklm";

/** Injectable command runner. Default shells out to the real `notebooklm` binary. */
export type Runner = (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

const defaultRun: Runner = (file, args) =>
  // Answers can be large; lift maxBuffer well above the 1 MB default.
  execFileAsync(file, args, { maxBuffer: 64 * 1024 * 1024 });

export interface NbReference {
  source_id: string;
  citation_number: number;
  cited_text: string;
}

async function runRaw(run: Runner, args: string[]): Promise<string> {
  try {
    const { stdout } = await run(BIN, args);
    return stdout;
  } catch (e) {
    const err = e as Error & { stderr?: string };
    const detail = err.stderr?.trim() || err.message;
    throw new Error(`notebooklm ${args.join(" ")} failed: ${detail}`);
  }
}

async function runJson<T>(run: Runner, args: string[]): Promise<T> {
  const stdout = await runRaw(run, args);
  try {
    return JSON.parse(stdout) as T;
  } catch {
    throw new Error(`notebooklm ${args.join(" ")} returned unparseable output: ${stdout.slice(0, 200)}`);
  }
}

/** Auth precheck: a thrown nbList means "not logged in / CLI broken". */
export async function nbList(
  run: Runner = defaultRun,
): Promise<{ notebooks: { id: string; title: string; is_owner: boolean }[] }> {
  return runJson(run, ["list", "--json"]);
}

export async function nbCreate(title: string, run: Runner = defaultRun): Promise<{ id: string }> {
  const res = await runJson<{ notebook: { id: string } }>(run, ["create", title, "--json"]);
  return { id: res.notebook.id };
}

export async function nbSourceAdd(
  notebookId: string,
  filePath: string,
  run: Runner = defaultRun,
): Promise<{ id: string; title: string }> {
  // --type file is REQUIRED for PDFs.
  const res = await runJson<{ source: { id: string; title: string } }>(
    run,
    ["source", "add", filePath, "--type", "file", "-n", notebookId, "--json"],
  );
  return { id: res.source.id, title: res.source.title };
}

export async function nbSourceWait(notebookId: string, sourceId: string, run: Runner = defaultRun): Promise<void> {
  // Blocks until the source is "ready"; prints a human line, not JSON.
  await runRaw(run, ["source", "wait", sourceId, "-n", notebookId]);
}

export async function nbAsk(
  notebookId: string,
  question: string,
  run: Runner = defaultRun,
): Promise<{ answer: string; references: NbReference[] }> {
  const res = await runJson<{ answer?: string; references?: NbReference[] }>(
    run,
    ["ask", question, "-n", notebookId, "--json"],
  );
  return { answer: res.answer ?? "", references: Array.isArray(res.references) ? res.references : [] };
}
