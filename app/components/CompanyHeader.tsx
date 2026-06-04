import type { Company } from "../../src/types.js";

export function CompanyHeader({ company }: { company: Company }) {
  return (
    <div style={{ fontWeight: 700, fontSize: 16 }}>
      {company.name}{" "}
      <span style={{ color: "var(--muted)", fontWeight: 400 }}>
        {company.ticker ? `· ${company.ticker}` : ""} {company.industry ? `· ${company.industry}` : ""}
      </span>
    </div>
  );
}
