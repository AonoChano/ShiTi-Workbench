import type { InputHTMLAttributes, ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "../../utils/cn";

interface AuthCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> {
  children: ReactNode;
  error?: string;
}

/** 纸质风格的复选框：15px 方块，选中后实心绿 + 白色对勾 */
export function AuthCheckbox({ children, error, id, ...inputProps }: AuthCheckboxProps) {
  return (
    <div>
      <label className="flex cursor-pointer select-none items-start gap-2 text-small leading-[1.6] text-body">
        <input id={id} type="checkbox" className="peer sr-only" aria-invalid={error ? true : undefined} {...inputProps} />
        <span
          aria-hidden="true"
          className={cn(
            "mt-[2px] grid size-[15px] shrink-0 place-items-center rounded-xs border bg-card text-white transition-colors",
            error ? "border-clay" : "border-line-strong",
            "peer-checked:border-action peer-checked:bg-action",
            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
            "[&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100",
          )}
        >
          <Check className="size-[11px] transition-opacity" strokeWidth={2.6} />
        </span>
        <span>{children}</span>
      </label>
      {error && (
        <p role="alert" className="mt-1 pl-[23px] text-small text-clay-ink">
          {error}
        </p>
      )}
    </div>
  );
}
