export function Citation({ href, page, filingType }: { href: string | null; page: number | null; filingType: string | null }) {
  if (!href || page === null) {
    return <span style={{ color: "var(--muted)" }}>chart / unconfirmed</span>;
  }
  const label = filingType ? `${filingType} p${page}` : `p${page}`;
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}
