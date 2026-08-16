import {
  Clock3,
  Copy,
  Gauge,
  HardDrive,
  MoreHorizontal,
  Plus,
  Radio,
  Smartphone,
  Zap,
} from "lucide-react";

import { Badge, Button, Card } from "@wifi/ui";

import { PageHeader } from "@/components/page-header";

const policies = [
  {
    name: "Invitados Premium",
    description: "Acceso de alta velocidad para huéspedes",
    active: 142,
    speed: "100 / 30 Mbps",
    duration: "24 horas",
    quota: "20 GB",
    devices: "3",
    default: true,
    color: "brand",
  },
  {
    name: "WiFi gratuito",
    description: "Acceso básico con aceptación legal",
    active: 84,
    speed: "20 / 10 Mbps",
    duration: "4 horas",
    quota: "5 GB",
    devices: "2",
    color: "cyan",
  },
  {
    name: "Eventos · Jornada",
    description: "Voucher de un día para asistentes",
    active: 22,
    speed: "50 / 20 Mbps",
    duration: "1 día",
    quota: "10 GB",
    devices: "1",
    color: "violet",
  },
  {
    name: "Dispositivos internos",
    description: "TPV, televisores e IoT autorizado",
    active: 17,
    speed: "Sin límite",
    duration: "Continuo",
    quota: "Sin cuota",
    devices: "1",
    color: "amber",
  },
];

const accent: Record<string, string> = {
  brand: "from-brand-500 to-brand-700",
  cyan: "from-cyan-400 to-cyan-600",
  violet: "from-violet-400 to-violet-600",
  amber: "from-amber-400 to-orange-500",
};

export default function ServicesPage() {
  return (
    <>
      <PageHeader
        title="Servicios y políticas"
        description="Define límites de velocidad, tiempo, consumo y concurrencia que se compilan a atributos RADIUS explicables."
        actions={
          <Button>
            <Plus className="size-4" /> Nueva política
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs text-sky-800">
        <Radio className="size-4 shrink-0" />
        <span>
          <strong>Compilador seguro:</strong> cada cambio genera una nueva versión, una vista previa
          de atributos y un diff antes de publicar.
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {policies.map((policy) => (
          <Card key={policy.name} className="group overflow-hidden">
            <div className={`h-1.5 bg-gradient-to-r ${accent[policy.color]}`} />
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span
                    className={`grid size-10 place-items-center rounded-xl bg-gradient-to-br text-white ${accent[policy.color]}`}
                  >
                    <Zap className="size-4.5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-extrabold text-slate-900">{policy.name}</h2>
                      {policy.default ? <Badge variant="brand">Predeterminado</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{policy.description}</p>
                  </div>
                </div>
                <button aria-label={`Opciones de ${policy.name}`} className="text-slate-400">
                  <MoreHorizontal className="size-5" />
                </button>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4 rounded-xl bg-slate-50 p-4">
                <div className="flex items-center gap-2">
                  <Gauge className="size-4 text-slate-400" />
                  <span>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Velocidad ↓ / ↑
                    </span>
                    <span className="mt-1 block text-xs font-extrabold text-slate-700">
                      {policy.speed}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock3 className="size-4 text-slate-400" />
                  <span>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Duración
                    </span>
                    <span className="mt-1 block text-xs font-extrabold text-slate-700">
                      {policy.duration}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <HardDrive className="size-4 text-slate-400" />
                  <span>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Cuota total
                    </span>
                    <span className="mt-1 block text-xs font-extrabold text-slate-700">
                      {policy.quota}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Smartphone className="size-4 text-slate-400" />
                  <span>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Dispositivos
                    </span>
                    <span className="mt-1 block text-xs font-extrabold text-slate-700">
                      {policy.devices}
                    </span>
                  </span>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  <strong className="text-slate-900">{policy.active}</strong> sesiones activas
                </span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm">
                    <Copy className="size-3.5" /> Duplicar
                  </Button>
                  <Button variant="secondary" size="sm">
                    Editar
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
        <button className="grid min-h-64 place-items-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 p-8 text-center transition hover:border-brand-300 hover:bg-brand-50/30">
          <span>
            <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-slate-100 text-slate-500">
              <Plus className="size-5" />
            </span>
            <span className="mt-4 block text-sm font-extrabold text-slate-800">
              Crear una política
            </span>
            <span className="mt-1 block max-w-xs text-xs leading-5 text-slate-500">
              Configura acceso, límites y método de activación con validación automática.
            </span>
          </span>
        </button>
      </div>
    </>
  );
}
