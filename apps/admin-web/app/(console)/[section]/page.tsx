import { Download, Plus } from "lucide-react";
import { notFound } from "next/navigation";

import { Badge, Button } from "@wifi/ui";

import { PageHeader } from "@/components/page-header";
import { TableFrame } from "@/components/table-frame";
import { consoleSections, type ConsoleSection } from "@/lib/console-data";

function isSection(value: string): value is ConsoleSection {
  return value in consoleSections;
}

function statusVariant(value: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (
    [
      "Operativo",
      "Online",
      "Activo",
      "Activa",
      "Autorizado",
      "Disponible",
      "Vigente",
      "Correcto",
      "Consentido",
    ].includes(value)
  )
    return "success";
  if (["Atención", "Configurando", "Revisión", "Revisión DPO", "Bloqueado"].includes(value))
    return "warning";
  if (["Revocado"].includes(value)) return "danger";
  if (["Finalizada"].includes(value)) return "neutral";
  return "info";
}

export default async function GenericSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!isSection(section)) notFound();
  const data = consoleSections[section];
  return (
    <>
      <PageHeader
        title={data.title}
        description={data.description}
        actions={
          <>
            <Button variant="secondary">
              <Download className="size-4" /> Exportar
            </Button>
            <Button>
              <Plus className="size-4" /> {data.action}
            </Button>
          </>
        }
      />
      <TableFrame
        title={data.title}
        subtitle={`${data.rows.length} registros visibles en el ámbito seleccionado`}
      >
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70">
              {data.columns.map((column) => (
                <th
                  key={column}
                  className="px-5 py-3 text-[10px] font-extrabold uppercase tracking-[0.09em] text-slate-400"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.map((row, rowIndex) => (
              <tr key={`${section}-${rowIndex}`} className="group hover:bg-slate-50/70">
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${cell}-${cellIndex}`}
                    className={`px-5 py-4 text-xs ${cellIndex === 0 ? "font-bold text-slate-900" : "font-medium text-slate-600"}`}
                  >
                    {cellIndex === row.length - 1 ? (
                      <Badge variant={statusVariant(cell)} dot>
                        {cell}
                      </Badge>
                    ) : (
                      cell
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TableFrame>
    </>
  );
}
