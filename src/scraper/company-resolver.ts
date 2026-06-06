export interface ResolvedCompany {
  name: string;
  slug: string;
}

export interface ScrapeArgs {
  company: ResolvedCompany;
  includeAnnualReports: boolean;
  perType?: number;
}

const KNOWN_SLUGS: Record<string, string> = {
  "asianpaints": "ASIANPAINT",
  "asian paints": "ASIANPAINT",
  "asian paints ltd": "ASIANPAINT",
  "asian paints limited": "ASIANPAINT",
  "berger paints": "BERGEPAINT",
  "berger paints india": "BERGEPAINT",
  "berger paints india ltd": "BERGEPAINT",
  "kansai nerolac": "KANSAINER",
  "kansai nerolac paints": "KANSAINER",
  "indigo paints": "INDIGOPNTS",
  "akzo nobel india": "AKZOINDIA",
  "pidilite industries": "PIDILITIND",
  "samhi hotels": "SAMHI",
  "samhi hotels ltd": "SAMHI",
  "samhi hotels limited": "SAMHI",
};

function key(value: string): string {
  return value.toLowerCase().replace(/\blimited\b/g, "ltd").replace(/[^a-z0-9]+/g, " ").trim();
}

function fallbackSlug(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function resolveCompany(input: { name?: string | null; slug?: string | null }): ResolvedCompany {
  const rawName = input.name?.trim();
  const rawSlug = input.slug?.trim();
  const name = rawName || rawSlug;
  if (!name) throw new Error("missing company name");

  const slug = rawSlug || KNOWN_SLUGS[key(name)] || fallbackSlug(name);
  if (/^-/.test(name) || /^-/.test(slug)) throw new Error("company name/slug cannot start with '-'");
  return { name, slug: slug.toUpperCase() };
}

export function parseScrapeArgs(argv: string[]): ScrapeArgs {
  let name: string | null = null;
  let slug: string | null = null;
  let includeAnnualReports = false;
  let perType: number | undefined;
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--annual") {
      includeAnnualReports = true;
    } else if (arg === "--name") {
      name = argv[++i] ?? "";
    } else if (arg === "--slug") {
      slug = argv[++i] ?? "";
    } else if (arg === "--per-type") {
      const raw = argv[++i] ?? "";
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 1) throw new Error(`invalid --per-type value: ${raw}`);
      perType = n;
    } else {
      positional.push(arg);
    }
  }

  if (!name && !slug && positional.length > 1) {
    slug = positional[0];
    name = positional[1];
  } else if (!name && !slug && positional.length > 0) {
    // Legacy one-arg usage is now treated as a company name so "Asian Paints" never becomes a URL slug.
    name = positional[0];
  }
  if (!name && slug && positional.length > 0) name = positional[0];
  if (name && !slug && positional.length > 1) slug = positional[0];

  return { includeAnnualReports, perType, company: resolveCompany({ name, slug }) };
}
