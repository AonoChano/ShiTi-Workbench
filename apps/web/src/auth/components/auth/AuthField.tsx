import type { InputHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/cn";

interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className"> {
  id: string;
  label: string;
  icon: LucideIcon;
  /** 校验错误（陶土色） */
  error?: string;
  /** 中性提示 */
  hint?: ReactNode;
  /** 温和警告（麦色），如"大写锁定已开启" */
  warning?: string;
  /** 输入框右侧的操作区，如显示 / 隐藏密码按钮 */
  trailing?: ReactNode;
  /** label 同一行右侧的内容 */
  labelAside?: ReactNode;
  /** 输入框下方的额外内容，如密码强度条 */
  footer?: ReactNode;
}

/**
 * 带图标的输入框。
 * focus 时双层反馈：边框转绿 + 2px 浅绿环；错误时边框转陶土色，同样带浅环。
 */
export function AuthField({
  id,
  label,
  icon: Icon,
  error,
  hint,
  warning,
  trailing,
  labelAside,
  footer,
  ...inputProps
}: AuthFieldProps) {
  const messageId = `${id}-message`;
  const hasMessage = Boolean(error || warning || hint);

  return (
    <div className="space-y-1.5">
      <div className="flex min-h-[16px] items-center justify-between gap-3">
        <label htmlFor={id} className="text-small font-medium text-body">
          {label}
        </label>
        {labelAside}
      </div>

      <div
        className={cn(
          "group relative flex items-center rounded-input border bg-card transition-[border-color,box-shadow] duration-200",
          error
            ? "border-clay ring-2 ring-clay-line/70"
            : "border-line-strong hover:border-fill focus-within:border-focus focus-within:ring-2 focus-within:ring-tint hover:focus-within:border-focus",
        )}
      >
        <Icon
          className={cn(
            "pointer-events-none absolute left-3 size-[15px] transition-colors",
            error ? "text-clay" : "text-faint group-focus-within:text-option",
          )}
          strokeWidth={1.65}
          aria-hidden="true"
        />
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={hasMessage ? messageId : undefined}
          className={cn(
            "h-[42px] w-full min-w-0 rounded-input bg-transparent pl-[37px] text-control text-ink outline-none placeholder:text-placeholder",
            trailing ? "pr-11" : "pr-3",
          )}
          {...inputProps}
        />
        {trailing && <div className="absolute right-1 flex items-center">{trailing}</div>}
      </div>

      {hasMessage && (
        <p
          id={messageId}
          role={error ? "alert" : undefined}
          className={cn(
            "text-small leading-[1.5]",
            error ? "text-clay-ink" : warning ? "text-wheat-ink" : "text-muted",
          )}
        >
          {error ?? warning ?? hint}
        </p>
      )}
      {footer}
    </div>
  );
}
