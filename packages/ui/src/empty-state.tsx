import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center px-6 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-500">
        {icon}
      </div>
      <h3 className="mt-4 text-sm font-bold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
