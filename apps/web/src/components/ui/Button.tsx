import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Spinner } from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover disabled:bg-brand/50",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-paper disabled:text-muted",
  ghost: "text-ink-2 hover:bg-ink/5 disabled:text-muted",
  danger: "border border-danger/30 bg-surface text-danger hover:bg-danger-soft disabled:opacity-50"
};

const sizes: Record<Size, string> = { sm: "h-8 px-3 text-[13px]", md: "h-10 px-4 text-sm" };

export function Button({ variant = "secondary", size = "md", loading, icon, children, className, disabled, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed",
        variants[variant], sizes[size], className
      )}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
}
