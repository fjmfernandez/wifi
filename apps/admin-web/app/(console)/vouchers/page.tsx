import { Ban, Download, Eye, FileDown, KeyRound, Plus, Printer, RefreshCcw } from "lucide-react";

import { Badge, Button, Card } from "@wifi/ui";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { TableFrame } from "@/components/table-frame";

const vouchers = [
  [
    "MIR-7K4P-9W2D",
    "Recepción agosto",
    "Invitados Premium",
    "Hotel Miramar",
    "16 ago · 10:38",
    "Activo",
  ],
  [
    "MIR-3X8N-6Q5T",
    "Recepción agosto",
    "Invitados Premium",
    "Hotel Miramar",
    "Sin usar",
    "Disponible",
  ],
  [
    "EVT-8M2R-4Y7C",
    "Congreso medicina",
    "Eventos · Jornada",
    "Palacio Congresos",
    "15 ago · 09:02",
    "Agotado",
  ],
  [
    "COS-5J9V-2P6H",
    "Verano Costa Sur",
    "WiFi gratuito",
    "Hotel Costa Sur",
    "12 ago · 18:44",
    "Revocado",
  ],
];

export default function VouchersPage() {
  return (
    <>
      <PageHeader
        title="Vouchers"
        description="Emite accesos individuales o por lote con códigos aleatorios, revelado temporal y redención atómica."
        actions={
          <>
            <Button variant="secondary">
              <FileDown className="size-4" /> Nuevo lote
            </Button>
            <Button>
              <Plus className="size-4" /> Crear voucher
            </Button>
          </>
        }
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Disponibles"
          value="428"
          helper="en 12 lotes activos"
          icon={KeyRound}
          accent="brand"
        />
        <MetricCard
          label="Activados hoy"
          value="74"
          change="18%"
          helper="frente a ayer"
          icon={RefreshCcw}
          accent="cyan"
        />
        <MetricCard
          label="Caducan en 7 días"
          value="36"
          helper="revisión recomendada"
          icon={Ban}
          accent="amber"
        />
        <MetricCard
          label="Tasa de uso"
          value="68,4%"
          change="3,2%"
          helper="últimos 30 días"
          icon={Eye}
          accent="violet"
        />
      </div>
      <Card className="mb-4 flex flex-col gap-3 border-emerald-100 bg-emerald-50/60 p-4 sm:flex-row sm:items-center">
        <span className="grid size-9 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm">
          <KeyRound className="size-4" />
        </span>
        <div className="flex-1">
          <p className="text-xs font-extrabold text-emerald-900">Protección de códigos activa</p>
          <p className="mt-0.5 text-xs leading-5 text-emerald-800/75">
            Los códigos completos solo se revelan durante 15 minutos. Una reimpresión posterior rota
            y revoca el código anterior.
          </p>
        </div>
        <Button variant="secondary" size="sm">
          <Printer className="size-3.5" /> Centro de impresión
        </Button>
      </Card>
      <TableFrame
        title="Vouchers recientes"
        subtitle="Códigos enmascarados automáticamente después de su ventana de revelado"
      >
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70">
              {["Código", "Lote", "Servicio", "Sede", "Activación", "Estado", "Acciones"].map(
                (item) => (
                  <th
                    key={item}
                    className="px-5 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400"
                  >
                    {item}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {vouchers.map((voucher) => (
              <tr key={voucher[0]} className="hover:bg-slate-50/70">
                {voucher.map((cell, index) => (
                  <td
                    key={`${cell}-${index}`}
                    className={`px-5 py-4 text-xs ${index === 0 ? "font-mono font-bold tracking-wider text-slate-900" : "font-medium text-slate-600"}`}
                  >
                    {index === 5 ? (
                      <Badge
                        variant={
                          cell === "Activo"
                            ? "success"
                            : cell === "Disponible"
                              ? "brand"
                              : cell === "Revocado"
                                ? "danger"
                                : "neutral"
                        }
                        dot
                      >
                        {cell}
                      </Badge>
                    ) : (
                      cell
                    )}
                  </td>
                ))}
                <td className="px-5 py-4">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="size-8">
                      <Eye className="size-3.5" />
                      <span className="sr-only">Ver</span>
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8">
                      <Download className="size-3.5" />
                      <span className="sr-only">Descargar</span>
                    </Button>
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
