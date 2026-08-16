import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        {eyebrow ? (
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-brand-700">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-extrabold tracking-[-0.035em] text-slate-950 sm:text-[28px]">
          {title}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
