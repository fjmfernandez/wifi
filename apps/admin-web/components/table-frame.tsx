import { ChevronLeft, ChevronRight, Filter, Search } from "lucide-react";
import type { ReactNode } from "react";

import { Button, Card, Select } from "@wifi/ui";

export function TableFrame({
  title,
  subtitle,
  children,
  filters = true,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  filters?: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center">
        <div>
          <h2 className="text-sm font-extrabold text-slate-900">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
        </div>
        {filters ? (
          <div className="ml-auto flex w-full flex-wrap gap-2 lg:w-auto">
            <label className="relative min-w-52 flex-1 lg:flex-none">
              <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
              <input
                aria-label="Buscar en la tabla"
                placeholder="Buscar…"
                className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100"
              />
            </label>
            <Select aria-label="Filtrar estado" className="h-9 text-xs">
              <option>Todos los estados</option>
              <option>Operativo</option>
              <option>Atención</option>
              <option>Inactivo</option>
            </Select>
            <Button variant="secondary" size="sm">
              <Filter className="size-3.5" />
              Filtros
            </Button>
          </div>
        ) : null}
      </div>
      <div className="overflow-x-auto">{children}</div>
      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
        <span>Mostrando 1–10 de 24</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-8">
            <ChevronLeft className="size-4" />
            <span className="sr-only">Página anterior</span>
          </Button>
          <span className="grid size-8 place-items-center rounded-lg bg-brand-50 font-bold text-brand-700">
            1
          </span>
          <span className="grid size-8 place-items-center rounded-lg">2</span>
          <span className="grid size-8 place-items-center rounded-lg">3</span>
          <Button variant="ghost" size="icon" className="size-8">
            <ChevronRight className="size-4" />
            <span className="sr-only">Página siguiente</span>
          </Button>
        </div>
      </div>
    </Card>
  );
}
