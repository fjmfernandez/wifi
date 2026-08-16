import {
  ArrowUpRight,
  Download,
  MapPin,
  MoreHorizontal,
  Plus,
  Router,
  UsersRound,
} from "lucide-react";

import { Badge, Button } from "@wifi/ui";

import { PageHeader } from "@/components/page-header";
import { TableFrame } from "@/components/table-frame";

const sites = [
  {
    name: "Hotel Miramar Málaga",
    code: "MIR-AGP-01",
    city: "Málaga",
    gateways: "2 / 2",
    active: 186,
    traffic: "684 GB",
    seen: "Hace 18 s",
    status: "Operativa",
  },
  {
    name: "Hotel Costa Sur",
    code: "COS-AGP-01",
    city: "Estepona",
    gateways: "1 / 1",
    active: 62,
    traffic: "328 GB",
    seen: "Hace 1 min",
    status: "Atención",
  },
  {
    name: "Restaurante La Marina",
    code: "MAR-MIJ-01",
    city: "Mijas",
    gateways: "1 / 1",
    active: 28,
    traffic: "89 GB",
    seen: "Hace 36 s",
    status: "Operativa",
  },
  {
    name: "Palacio de Congresos",
    code: "EVT-MAL-03",
    city: "Málaga",
    gateways: "0 / 1",
    active: 0,
    traffic: "—",
    seen: "Nunca",
    status: "Configurando",
  },
];

export default function SitesPage() {
  return (
    <>
      <PageHeader
        title="Sedes"
        description="Gestiona establecimientos, configuración heredada y salud de red desde un único ámbito."
        actions={
          <>
            <Button variant="secondary">
              <Download className="size-4" /> Exportar
            </Button>
            <Button>
              <Plus className="size-4" /> Nueva sede
            </Button>
          </>
        }
      />
      <TableFrame title="Todas las sedes" subtitle="4 sedes · 3 operativas · 1 requiere atención">
        <table className="w-full min-w-[980px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70">
              <th className="px-5 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Sede
              </th>
              <th className="px-5 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Gateways
              </th>
              <th className="px-5 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Activos
              </th>
              <th className="px-5 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Tráfico mensual
              </th>
              <th className="px-5 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Última conexión
              </th>
              <th className="px-5 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Estado
              </th>
              <th className="px-5 py-3">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sites.map((site) => (
              <tr key={site.code} className="hover:bg-slate-50/70">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-brand-50 font-extrabold text-brand-700">
                      {site.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span>
                      <span className="block text-xs font-extrabold text-slate-900">
                        {site.name}
                      </span>
                      <span className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                        <MapPin className="size-3" />
                        {site.city} · {site.code}
                      </span>
                    </span>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <Router className="size-3.5 text-slate-400" />
                    {site.gateways}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <UsersRound className="size-3.5 text-slate-400" />
                    {site.active}
                  </span>
                </td>
                <td className="px-5 py-4 text-xs font-semibold text-slate-600">{site.traffic}</td>
                <td className="px-5 py-4 text-xs text-slate-500">{site.seen}</td>
                <td className="px-5 py-4">
                  <Badge variant={site.status === "Operativa" ? "success" : "warning"} dot>
                    {site.status}
                  </Badge>
                </td>
                <td className="px-5 py-4">
                  <div className="flex justify-end">
                    <button
                      aria-label={`Abrir ${site.name}`}
                      className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-brand-700"
                    >
                      <ArrowUpRight className="size-4" />
                    </button>
                    <button
                      aria-label={`Más acciones para ${site.name}`}
                      className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-white"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableFrame>
    </>
  );
}
