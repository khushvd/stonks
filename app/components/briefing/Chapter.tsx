"use client";
import { useState, type ReactNode } from "react";

interface ChapterProps {
  index: number;
  total: number;
  id: string;
  eyebrow: string;
  title: string;
  dek?: string;
  alt?: boolean;
  hint?: boolean;
  children: ReactNode;
  detail?: ReactNode;
}

const padN = (n: number) => String(n).padStart(2, "0");

export default function Chapter({ index, total, id, eyebrow, title, dek, alt, hint, children, detail }: ChapterProps) {
  const [open, setOpen] = useState(false);
  return (
    <section
      className={"chapter" + (alt ? " alt" : "")}
      id={id}
      data-chapter={index}
      data-screen-label={padN(index)}
      onDoubleClick={detail ? () => setOpen((o) => !o) : undefined}
    >
      <span className="watermark">{padN(index)}</span>
      <div className="chapter-inner">
        <div className="ch-head">
          <div className="ch-index">{padN(index)} / {padN(total)} · {eyebrow}</div>
          <h2 className="ch-title">{title}</h2>
          {dek && <p className="ch-dek">{dek}</p>}
        </div>
        {children}
        {detail && (
          <div>
            <button className={"expand-btn" + (open ? " open" : "")} onClick={() => setOpen((o) => !o)}>
              {open ? "Collapse" : "Expand detail"} <span className="chev">▾</span>
            </button>
            <div className={"detail" + (open ? " open" : "")}>
              <div className="detail-inner"><div className="detail-pad">{detail}</div></div>
            </div>
          </div>
        )}
      </div>
      {hint && (
        <div className="scroll-hint"><span>scroll · or ↓</span><span>⌄</span></div>
      )}
    </section>
  );
}
