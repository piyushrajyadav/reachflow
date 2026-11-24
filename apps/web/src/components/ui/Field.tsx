import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

const control =
  "w-full rounded-md border bg-surface px-3 text-sm placeholder:text-muted/80 transition-colors " +
  "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 disabled:bg-paper disabled:text-muted";

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby": string | undefined }) => ReactNode;
}

/** Label + control + hint/error wiring in one place so every form stays accessible and consistent. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId();
  const descId = hint || error ? `${id}-desc` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-ink">{label}</label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": descId })}
      {(error || hint) && (
        <p id={descId} className={cn("mt-1.5 text-xs", error ? "text-danger" : "text-muted")}>{error ?? hint}</p>
      )}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cn(control, "h-10", rest["aria-invalid"] ? "border-danger" : "border-line-strong", className)}
    />
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      className={cn(control, "min-h-28 resize-y py-2.5 leading-relaxed", rest["aria-invalid"] ? "border-danger" : "border-line-strong", className)}
    />
  );
}
