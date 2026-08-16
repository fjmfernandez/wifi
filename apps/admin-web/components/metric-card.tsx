import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";

import { Card, cn } from "@wifi/ui";

export function MetricCard({
  label,
  value,
  change,
  positive = true,
  helper,
  icon: Icon,
  accent = "brand",
}: {
  label: string;
  value: string;
  change?: string;
  positive?: boolean;
  helper: string;
  icon: LucideIcon;
  accent?: "brand" | "cyan" | "violet" | "amber";
}) {
  const accentClasses = {
    brand: "bg-brand-50 text-brand-700",
    cyan: "bg-cyan-50 text-cyan-700",
    violet: "bg-violet-50 text-violet-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <span className={cn("grid size-10 place-items-center rounded-xl", accentClasses[accent])}>
          <Icon className="size-4.5" />
        </span>
        {change ? (
          <span
            className={cn(
              "flex items-center gap-1 text-[11px] font-bold",
              positive ? "text-emerald-600" : "text-rose-600",
            )}
          >
            {positive ? (
              <ArrowUpRight className="size-3.5" />
            ) : (
              <ArrowDownRight className="size-3.5" />
            )}
            {change}
          </span>
        ) : null}
      </div>
      <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-extrabold tracking-[-0.04em] text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </Card>
  );
}
