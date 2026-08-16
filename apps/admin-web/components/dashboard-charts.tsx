import { ArrowUpRight, MoreHorizontal } from "lucide-react";

import { Badge, Card, CardContent, CardHeader } from "@wifi/ui";

const traffic = [
  22, 28, 25, 40, 44, 39, 52, 61, 58, 72, 64, 79, 83, 74, 89, 82, 91, 84, 94, 88, 96, 92, 100, 97,
];
const logins = [18, 24, 31, 27, 39, 44, 51];

export function TrafficChart() {
  const points = traffic
    .map((value, index) => `${(index / (traffic.length - 1)) * 100},${108 - value}`)
    .join(" ");
  return (
    <Card className="overflow-hidden lg:col-span-2">
      <CardHeader className="items-center border-b border-slate-100">
        <div>
          <h2 className="text-sm font-extrabold text-slate-900">Actividad de la red</h2>
          <p className="mt-1 text-xs text-slate-500">
            Sesiones activas durante las últimas 24 horas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="success">
            <ArrowUpRight className="size-3" /> 12,4%
          </Badge>
          <select
            aria-label="Periodo"
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600"
          >
            <option>24 horas</option>
            <option>7 días</option>
            <option>30 días</option>
          </select>
        </div>
      </CardHeader>
      <CardContent className="pb-4 pt-5">
        <div className="mb-5 flex flex-wrap gap-7">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Pico concurrente
            </p>
            <p className="mt-1 text-xl font-extrabold text-slate-950">186</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Media de sesión
            </p>
            <p className="mt-1 text-xl font-extrabold text-slate-950">48 min</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Tráfico total
            </p>
            <p className="mt-1 text-xl font-extrabold text-slate-950">1,42 TB</p>
          </div>
        </div>
        <div className="relative h-52 w-full overflow-hidden">
          <div className="absolute inset-0 grid grid-rows-4">
            <span className="border-t border-dashed border-slate-100" />
            <span className="border-t border-dashed border-slate-100" />
            <span className="border-t border-dashed border-slate-100" />
            <span className="border-y border-dashed border-slate-100" />
          </div>
          <svg
            viewBox="0 0 100 110"
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
            aria-label="Gráfico de sesiones activas"
          >
            <defs>
              <linearGradient id="trafficFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#338cff" stopOpacity=".24" />
                <stop offset="100%" stopColor="#338cff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`M ${points} L 100,110 L 0,110 Z`} fill="url(#trafficFill)" />
            <polyline
              points={points}
              fill="none"
              vectorEffect="non-scaling-stroke"
              stroke="#1a6cf5"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="mt-2 flex justify-between text-[10px] font-medium text-slate-400">
          <span>00:00</span>
          <span>04:00</span>
          <span>08:00</span>
          <span>12:00</span>
          <span>16:00</span>
          <span>20:00</span>
          <span>Ahora</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function LoginMethodsChart() {
  const methods = [
    { label: "Click-through", value: 48, color: "bg-brand-500" },
    { label: "Voucher / PIN", value: 31, color: "bg-cyan-500" },
    { label: "Correo", value: 21, color: "bg-violet-500" },
  ];
  return (
    <Card>
      <CardHeader>
        <div>
          <h2 className="text-sm font-extrabold text-slate-900">Métodos de acceso</h2>
          <p className="mt-1 text-xs text-slate-500">Distribución últimos 7 días</p>
        </div>
        <button aria-label="Más opciones" className="text-slate-400">
          <MoreHorizontal className="size-5" />
        </button>
      </CardHeader>
      <CardContent>
        <div className="mb-7 flex items-end gap-2.5 border-b border-slate-100 pb-4">
          {logins.map((value, index) => (
            <div key={index} className="flex h-28 flex-1 items-end">
              <span
                className="w-full rounded-t-md bg-brand-100"
                style={{ height: `${value * 1.8}px` }}
              >
                <span className="block size-full rounded-t-md bg-gradient-to-t from-brand-500 to-brand-400 opacity-90" />
              </span>
            </div>
          ))}
        </div>
        <div className="grid gap-3">
          {methods.map((method) => (
            <div
              key={method.label}
              className="grid grid-cols-[1fr_auto] items-center gap-3 text-xs"
            >
              <span className="flex items-center gap-2 font-semibold text-slate-600">
                <span className={`size-2 rounded-full ${method.color}`} />
                {method.label}
              </span>
              <span className="font-extrabold text-slate-900">{method.value}%</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
