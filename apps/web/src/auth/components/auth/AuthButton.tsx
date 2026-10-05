import type { ButtonHTMLAttributes, ReactNode } from "react";
import { CircleCheck, LoaderCircle } from "lucide-react";
import { cn } from "../../utils/cn";

interface AuthButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary 实心绿 / outline 描边 / quiet 浅底 —— 只有三级 */
  variant?: "primary" | "outline" | "quiet";
  /** 提交状态：idle 正常 / loading 转圈 / success 描画对勾 */
  state?: "idle" | "loading" | "success";
  loadingText?: string;
  successText?: string;
  block?: boolean;
  children: ReactNode;
}

const variants = {
  primary:
    "bg-action text-white hover:bg-action-hover hover:-translate-y-px hover:shadow-button active:translate-y-0 active:shadow-none",
  outline: "border border-line-strong bg-card text-body hover:border-focus hover:text-heading",
  quiet: "bg-wash text-heading hover:bg-tint/70",
} as const;

export function AuthButton({
  variant = "primary",
  state = "idle",
  loadingText,
  successText,
  block = true,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: AuthButtonProps) {
  const busy = state !== "idle";

  return (
    <button
      type={type}
      disabled={disabled}
      aria-busy={state === "loading" || undefined}
      className={cn(
        "inline-flex h-[42px] items-center justify-center gap-2 rounded-input px-4 text-control font-semibold",
        "transition-[transform,box-shadow,background-color,border-color,color] duration-200",
        "disabled:pointer-events-none disabled:opacity-45",
        busy && "pointer-events-none",
        block && "w-full",
        variants[variant],
        className,
      )}
      {...rest}
    >
      {state === "loading" ? (
        <>
          <LoaderCircle className="size-4 animate-spin" strokeWidth={1.9} aria-hidden="true" />
          {loadingText ?? children}
        </>
      ) : state === "success" ? (
        <>
          <CircleCheck className="draw-check size-4" strokeWidth={1.9} aria-hidden="true" />
          {successText ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}
