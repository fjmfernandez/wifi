import { RadioTower } from "lucide-react";

import { cn } from "./cn";

export function Brand({
  compact = false,
  inverse = false,
}: {
  compact?: boolean;
  inverse?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5" aria-label="WiFi ENTELSAT">
      <span
        className={cn(
          "grid size-9 place-items-center rounded-xl",
          inverse
            ? "bg-white/10 text-white"
            : "bg-brand-600 text-white shadow-lg shadow-brand-900/15",
        )}
      >
        <RadioTower className="size-4.5" strokeWidth={2.2} aria-hidden="true" />
      </span>
      {compact ? null : (
        <span className="leading-none">
          <span
            className={cn(
              "block text-sm font-extrabold tracking-[0.12em]",
              inverse ? "text-white" : "text-slate-950",
            )}
          >
            ENTELSAT
          </span>
          <span
            className={cn(
              "mt-1 block text-[9px] font-semibold tracking-[0.16em]",
              inverse ? "text-white/55" : "text-slate-400",
            )}
          >
            WIFI CLOUD
          </span>
        </span>
      )}
    </div>
  );
}
