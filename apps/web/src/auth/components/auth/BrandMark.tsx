import { BookOpenCheck } from "lucide-react";
import { cn } from "../../utils/cn";

interface BrandMarkProps {
  /** 图标块尺寸：sm 32px / md 43px */
  size?: "sm" | "md";
  className?: string;
  showWordmark?: boolean;
}

/** 粉彩圆角块里的 lucide 图标 + "拾题"字标 */
export function BrandMark({ size = "md", showWordmark = true, className }: BrandMarkProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span
        className={cn(
          "grid shrink-0 place-items-center rounded-chip bg-sage-block text-action",
          size === "md" ? "size-[43px]" : "size-8",
        )}
        aria-hidden="true"
      >
        <BookOpenCheck className={size === "md" ? "size-[21px]" : "size-4"} strokeWidth={1.7} />
      </span>
      {showWordmark && (
        <div className="leading-none">
          <div className="text-[17px] font-semibold tracking-[-0.3px] text-heading">拾题</div>
          <div className="eyebrow mt-1.5 !text-[8px] !text-faint">Shiti · English Practice</div>
        </div>
      )}
    </div>
  );
}
