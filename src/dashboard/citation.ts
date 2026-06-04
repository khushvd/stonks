import { resolve, join, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataRoot = join(projectRoot, "data");

// Link a metric to its source PDF at the cited page. Served by /api/pdf (file:// can't open from http).
export function buildCitationHref(localPath: string | null, page: number | null): string | null {
  if (!localPath || page === null) return null;
  // Normalise to a project-relative path for the ?path= param.
  const rel = isAbsolute(localPath) ? relative(projectRoot, localPath) : localPath;
  return `/api/pdf?path=${encodeURIComponent(rel)}#page=${page}`;
}

// Resolve a request ?path= to an absolute file, guarding traversal. Only *.pdf under data/ allowed.
export function resolvePdfPath(rawPath: string): string {
  const abs = isAbsolute(rawPath) ? rawPath : join(projectRoot, rawPath);
  const normalized = resolve(abs);
  if (normalized !== dataRoot && !normalized.startsWith(dataRoot + "/")) {
    throw new Error(`Refusing path outside data/: ${rawPath}`);
  }
  if (!normalized.toLowerCase().endsWith(".pdf")) {
    throw new Error(`Refusing path that is not a pdf: ${rawPath}`);
  }
  return normalized;
}
