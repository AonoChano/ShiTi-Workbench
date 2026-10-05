import type { ReactNode } from "react";
import { Reveal } from "./Reveal";
import { cn } from "../utils/cn";

type SectionHeadProps = {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  meta?: string[];
  align?: "left" | "center";
  className?: string;
};

/** eyebrow → 标题 → meta 行：几乎每个模块的排版骨架 */
export function SectionHead({ eyebrow, title, lede, meta, align = "left", className }: SectionHeadProps) {
  return (
    <div className={cn("max-w-[680px]", align === "center" && "mx-auto text-center", className)}>
      <Reveal>
        <span className="eyebrow">{eyebrow}</span>
      </Reveal>
      <Reveal index={1}>
        <h2 className="h-section mt-3">{title}</h2>
      </Reveal>
      {lede ? (
        <Reveal index={2}>
          <p className="lede mt-4">{lede}</p>
        </Reveal>
      ) : null}
      {meta?.length ? (
        <Reveal index={3} className={cn("meta mt-4", align === "center" && "justify-center")}>
          {meta.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </Reveal>
      ) : null}
    </div>
  );
}
