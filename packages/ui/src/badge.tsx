import type { HTMLAttributes } from "react";

import { cn } from "./cn";

type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const variants: Record<BadgeVariant, string> = {
  neutral: "bg-slate-100 text-slate-600 ring-slate-500/10",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/15",
  danger: "bg-rose-50 text-rose-700 ring-rose-600/15",
  info: "bg-sky-50 text-sky-700 ring-sky-600/15",
  brand: "bg-brand-50 text-brand-700 ring-brand-600/15",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  dot?: boolean;
}

export function Badge({ className, variant = "neutral", dot, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset",
        variants[variant],
        className,
      )}
      {...props}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
