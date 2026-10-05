import { useState } from "react";
import { SCREENSHOTS, screenshotSrc, type ScreenshotId } from "../config/screenshots";
import { cn } from "../utils/cn";

/**
 * 功能截图框。
 * 真图存在（public/screenshots/<file>）时显示真图；不存在时显示占位内容，不会出现破图。
 * 每个使用处都带有 SCREENSHOT-PLACEHOLDER:Sx 注释，方便替换时定位。
 */
export function ScreenshotFrame({ id, className }: { id: ScreenshotId; className?: string }) {
  const shot = SCREENSHOTS[id];
  const [state, setState] = useState<"pending" | "ok" | "missing">("pending");

  return (
    <figure className={cn("panel overflow-hidden", className)} data-screenshot={id}>
      {/* 假浏览器顶栏 —— 只是一个画框 */}
      <div className="flex h-8 items-center gap-1.5 border-b border-divider bg-material px-3" aria-hidden>
        <span className="h-[7px] w-[7px] rounded-full bg-[#dfe6d3]" />
        <span className="h-[7px] w-[7px] rounded-full bg-[#dfe6d3]" />
        <span className="h-[7px] w-[7px] rounded-full bg-[#dfe6d3]" />
        <span className="ml-3 flex h-[18px] flex-1 items-center rounded-[4px] border border-divider bg-card px-2 text-[9px] text-footnote">
          {shot.bar}
        </span>
      </div>

      <div className="relative aspect-[16/10] bg-paper">
        {state !== "missing" ? (
          <img
            src={screenshotSrc(id)}
            alt={shot.alt}
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setState("ok")}
            onError={() => setState("missing")}
            className={cn(
              "absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-300",
              state === "ok" ? "opacity-100" : "opacity-0",
            )}
          />
        ) : null}

        {state !== "ok" ? (
          <div className="placeholder-lines absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <span className="font-serif text-[44px] leading-none text-watermark">{shot.id}</span>
            <span className="eyebrow mt-3">Screenshot placeholder</span>
            <span className="mt-1.5 text-[14px] font-semibold text-heading">{shot.title}</span>
            <span className="mt-2 max-w-[380px] text-[11px] leading-relaxed text-muted">{shot.note}</span>
            <code className="mt-3 rounded-[4px] border border-divider bg-card px-2 py-1 text-[10px] text-list">
              public/screenshots/{shot.file}
            </code>
          </div>
        ) : null}
      </div>

      <figcaption className="meta border-t border-divider px-4 py-2.5">
        <span>{shot.title}</span>
        <span className="hidden sm:inline-flex">实机截图</span>
      </figcaption>
    </figure>
  );
}
