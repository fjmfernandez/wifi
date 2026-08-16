import {
  Activity,
  ArrowRight,
  CircleAlert,
  Download,
  HardDrive,
  Plus,
  Radio,
  Router,
  UsersRound,
  Wifi,
} from "lucide-react";
import Link from "next/link";

import { Badge, Button, Card, CardContent, CardHeader } from "@wifi/ui";

import { LoginMethodsChart, TrafficChart } from "@/components/dashboard-charts";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";

const gateways = [
  {
    name: "MikroTik · Principal",
    site: "Hotel Miramar Málaga",
    status: "Online",
    version: "RouterOS 7.21.5",
    load: 32,
  },
  {
    name: "MikroTik · Piscina",
    site: "Hotel Miramar Málaga",
    status: "Online",
    version: "RouterOS 7.21.5",
    load: 18,
  },
  {
    name: "MikroTik · Reservas",
    site: "Hotel Costa Sur",
    status: "Atención",
    version: "RouterOS 7.20.6",
    load: 67,
  },
];

const alerts = [
  {
    severity: "warning",
    title: "Latencia WAN elevada",
    site: "Hotel Costa Sur",
    time: "Hace 8 min",
  },
  {
    severity: "info",
    title: "Nueva versión de portal publicada",
    site: "Hotel Miramar Málaga",
    time: "Hace 42 min",
  },
  {
    severity: "success",
    title: "Backup de configuración completado",
    site: "3 gateways",
    time: "Hace 2 h",
  },
];

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Domingo, 16 de agosto"
        title="Buenos días, Francisco"
        description="Aquí tienes el estado operativo de tu servicio WiFi y los eventos que requieren atención."
        actions={
          <>
            <Button variant="secondary">
              <Download className="size-4" /> Exportar informe
            </Button>
            <Button>
              <Plus className="size-4" /> Nueva sede
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Usuarios activos"
          value="248"
          change="8,2%"
          helper="frente a ayer"
          icon={UsersRound}
          accent="brand"
        />
        <MetricCard
          label="Sesiones hoy"
          value="1.284"
          change="12,4%"
          helper="1.142 ayer"
          icon={Activity}
          accent="cyan"
        />
        <MetricCard
          label="Gateways online"
          value="11 / 12"
          change="1 atención"
          positive={false}
          helper="99,91% disponibilidad"
          icon={Router}
          accent="violet"
        />
        <MetricCard
          label="Datos transferidos"
          value="1,42 TB"
          change="4,7%"
          helper="este mes"
          icon={HardDrive}
          accent="amber"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <TrafficChart />
        <LoginMethodsChart />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.3fr_.7fr]">
        <Card>
          <CardHeader className="items-center border-b border-slate-100">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Estado de gateways</h2>
              <p className="mt-1 text-xs text-slate-500">
                Telemetría recibida en los últimos 60 segundos
              </p>
            </div>
            <Link
              href="/red"
              className="flex items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-800"
            >
              Ver todos <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {gateways.map((gateway) => (
                <div
                  key={gateway.name}
                  className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
                      <Router className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-extrabold text-slate-900">
                        {gateway.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                        {gateway.site} · {gateway.version}
                      </span>
                    </span>
                  </div>
                  <Badge variant={gateway.status === "Online" ? "success" : "warning"} dot>
                    {gateway.status}
                  </Badge>
                  <div className="flex w-28 items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className={
                          gateway.load > 60
                            ? "block h-full rounded-full bg-amber-500"
                            : "block h-full rounded-full bg-brand-500"
                        }
                        style={{ width: `${gateway.load}%` }}
                      />
                    </span>
                    <span className="w-7 text-right text-[10px] font-semibold text-slate-500">
                      {gateway.load}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="items-center border-b border-slate-100">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">Eventos recientes</h2>
              <p className="mt-1 text-xs text-slate-500">Operación y cambios de configuración</p>
            </div>
            <CircleAlert className="size-4 text-slate-400" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {alerts.map((alert) => (
                <div key={alert.title} className="flex gap-3 px-5 py-4">
                  <span
                    className={`mt-1 size-2 shrink-0 rounded-full ${alert.severity === "warning" ? "bg-amber-500" : alert.severity === "success" ? "bg-emerald-500" : "bg-brand-500"}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-slate-800">{alert.title}</span>
                    <span className="mt-1 block text-[11px] text-slate-500">
                      {alert.site} · {alert.time}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
          <div className="border-t border-slate-100 p-3">
            <Button variant="ghost" size="sm" className="w-full text-brand-700">
              Abrir centro de alertas <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-3 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50 to-cyan-50 p-5 sm:grid-cols-[auto_1fr_auto] sm:items-center">
        <span className="grid size-11 place-items-center rounded-xl bg-white text-brand-700 shadow-sm">
          <Wifi className="size-5" />
        </span>
        <div>
          <p className="text-sm font-extrabold text-slate-900">
            Todo preparado para tu siguiente sede
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            El asistente genera un despliegue revisable con preflight, copia de seguridad y
            rollback.
          </p>
        </div>
        <Button variant="secondary">
          Configurar gateway <Radio className="size-4" />
        </Button>
      </div>
    </>
  );
}
