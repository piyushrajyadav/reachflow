import { useState } from "react";
import { cn } from "../../lib/cn";

export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const [broken, setBroken] = useState(false);
  const initials = name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
  if (src && !broken) {
    return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={cn("size-9 rounded-full object-cover", className)} />;
  }
  return (
    <span aria-hidden="true" className={cn("flex size-9 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand", className)}>
      {initials || "?"}
    </span>
  );
}
