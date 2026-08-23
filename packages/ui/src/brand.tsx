import { cn } from "./cn";

export function Brand({
  compact = false,
  inverse = false,
}: {
  compact?: boolean;
  inverse?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5" aria-label="WPass">
      <span
        className={cn(
          "grid size-9 place-items-center rounded-xl border",
          inverse
            ? "border-white/15 bg-white/10 text-white"
            : "border-brand-200 bg-white text-slate-700 shadow-lg shadow-brand-900/10",
        )}
      >
        <svg viewBox="0 0 48 48" className="size-6" role="img" aria-hidden="true">
          <path
            d="M14 16a14 14 0 0 1 20 0M18 21a8.5 8.5 0 0 1 12 0"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="4"
            className={inverse ? "text-brand-300" : "text-brand-500"}
          />
          <path
            d="M10 25l5.5 12L22 24l6.5 13L38 21"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="4.5"
          />
        </svg>
      </span>
      {compact ? null : (
        <span className="leading-none">
          <span
            className={cn(
              "block text-lg font-black tracking-[-0.03em]",
              inverse ? "text-white" : "text-slate-950",
            )}
          >
            wpass<span className="text-brand-500">.es</span>
          </span>
          <span
            className={cn(
              "mt-1 block text-[9px] font-bold tracking-[0.18em]",
              inverse ? "text-white/55" : "text-slate-400",
            )}
          >
            WIFI MARKETING
          </span>
        </span>
      )}
    </div>
  );
}
