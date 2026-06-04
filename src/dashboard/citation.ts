import { resolve, join, dirname, relative, isAbsolute } from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataRoot = join(projectRoot, "data");

function isInsideDataRoot(p: string): boolean {
  return p === dataRoot || p.startsWith(dataRoot + "/");
}

// Link a metric to its source PDF at the cited page. Served by /api/pdf (file:// can't open from http).
export function buildCitationHref(localPath: string | null, page: number | null): string | null {
  if (!localPath || page === null) return null;
  // Normalise to a project-relative path for the ?path= param.
  const rel = isAbsolute(localPath) ? relative(projectRoot, localPath) : localPath;
  // An absolute path outside the project yields a `../..` relative path → broken href; refuse it.
  if (rel.startsWith("..")) return null;
  return `/api/pdf?path=${encodeURIComponent(rel)}#page=${page}`;
}

// Resolve a request ?path= to an absolute file, guarding traversal. Only *.pdf under data/ allowed.
export function resolvePdfPath(rawPath: string): string {
  // (a) Reject percent-encoded input first — legit data/ PDF paths never contain `%`.
  if (rawPath.includes("%")) {
    throw new Error(`Refusing percent-encoded path: ${rawPath}`);
  }
  // (b) Lexical prefix check on the normalized path (no filesystem access yet).
  const abs = isAbsolute(rawPath) ? rawPath : join(projectRoot, rawPath);
  const normalized = resolve(abs);
  if (!isInsideDataRoot(normalized)) {
    throw new Error(`Refusing path outside data/: ${rawPath}`);
  }
  // (c) Must be a PDF.
  if (!normalized.toLowerCase().endsWith(".pdf")) {
    throw new Error(`Refusing path that is not a pdf: ${rawPath}`);
  }
  // (d) Follow symlinks and re-check — blocks a `data/evil -> /etc` symlink bypass.
  let real: string;
  try {
    real = realpathSync(normalized);
  } catch {
    throw new Error(`Path does not exist: ${rawPath}`);
  }
  if (!isInsideDataRoot(real)) {
    throw new Error(`Refusing path outside data/: ${rawPath}`);
  }
  return normalized;
}
