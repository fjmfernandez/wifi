"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, FileDown, KeyRound, Plus, RefreshCcw } from "lucide-react";

import { Badge, Button, Card } from "@wifi/ui";

import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { TableFrame } from "@/components/table-frame";
import { adminApi, inputClass } from "../admin-api";

interface SiteView {
  id: string;
  name: string;
  code: string;
}

interface PolicyView {
  id: string;
  name: string;
  versionId: string | null;
}

interface VoucherBatchView {
  id: string;
  name: string;
  siteName: string;
  siteCode: string;
  policyName: string;
  quantity: number;
  available: number;
  used: number;
  expiresAt: string;
  createdAt: string;
  oneTimeCodes?: string[];
}

export default function VouchersPage() {
  const [sites, setSites] = useState<SiteView[]>([]);
  const [policies, setPolicies] = useState<PolicyView[]>([]);
  const [batches, setBatches] = useState<VoucherBatchView[]>([]);
  const [lastCodes, setLastCodes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setError(null);
    const [nextSites, nextPolicies, nextBatches] = await Promise.all([
      adminApi<SiteView[]>("/api/v1/admin/sites"),
      adminApi<PolicyView[]>("/api/v1/admin/policies"),
      adminApi<VoucherBatchView[]>("/api/v1/admin/voucher-batches"),
    ]);
    setSites(nextSites);
    setPolicies(nextPolicies.filter((policy) => policy.versionId));
    setBatches(nextBatches);
  }

  useEffect(() => {
    void refresh().catch((cause) =>
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar vouchers"),
    );
  }, []);

  const totals = useMemo(
    () => ({
      available: batches.reduce((sum, batch) => sum + batch.available, 0),
      used: batches.reduce((sum, batch) => sum + batch.used, 0),
      quantity: batches.reduce((sum, batch) => sum + batch.quantity, 0),
    }),
    [batches],
  );

  async function createBatch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const created = await adminApi<VoucherBatchView>("/api/v1/admin/voucher-batches", {
        method: "POST",
        body: JSON.stringify({
          siteId: data.get("siteId"),
          policyVersionId: data.get("policyVersionId"),
          name: data.get("name"),
          quantity: data.get("quantity"),
          expiresAt: new Date(String(data.get("expiresAt"))).toISOString(),
          defaultMaxUses: data.get("defaultMaxUses") || 1,
          defaultMaxDevices: data.get("defaultMaxDevices") || 1,
        }),
      });
      setLastCodes(created.oneTimeCodes ?? []);
      event.currentTarget.reset();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear el lote");
    } finally {
      setSaving(false);
    }
  }

  function downloadCodes(): void {
    const blob = new Blob([lastCodes.join("\n")], { type: "text/plain;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "vouchers-entelsat.txt";
    link.click();
    URL.revokeObjectURL(href);
  }

  return (
    <>
      <PageHeader
        title="Vouchers"
        description="Emite lotes de códigos para acceso WiFi y guarda solo el hash seguro en base de datos."
        actions={
          <Button variant="secondary" onClick={() => void refresh()}>
            <RefreshCcw className="size-4" /> Actualizar
          </Button>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Disponibles"
          value={`${totals.available}`}
          helper={`${batches.length} lotes`}
          icon={KeyRound}
          accent="brand"
        />
        <MetricCard
          label="Usados"
          value={`${totals.used}`}
          helper="redenciones registradas"
          icon={RefreshCcw}
          accent="cyan"
        />
        <MetricCard
          label="Emitidos"
          value={`${totals.quantity}`}
          helper="códigos generados"
          icon={FileDown}
          accent="violet"
        />
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      <form
        onSubmit={(event) => void createBatch(event)}
        className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h2 className="text-sm font-extrabold text-slate-900">Crear lote de vouchers</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          <input name="name" required placeholder="Nombre del lote" className={inputClass} />
          <select name="siteId" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Sede
            </option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <select name="policyVersionId" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Servicio
            </option>
            {policies.map((policy) => (
              <option key={policy.id} value={policy.versionId ?? ""}>
                {policy.name}
              </option>
            ))}
          </select>
          <input
            name="quantity"
            required
            type="number"
            min={1}
            max={250}
            defaultValue={25}
            className={inputClass}
          />
          <input name="expiresAt" required type="datetime-local" className={inputClass} />
          <input
            name="defaultMaxUses"
            type="number"
            min={1}
            defaultValue={1}
            placeholder="Usos"
            className={inputClass}
          />
          <input
            name="defaultMaxDevices"
            type="number"
            min={1}
            defaultValue={1}
            placeholder="Dispositivos"
            className={inputClass}
          />
        </div>
        <Button
          type="submit"
          className="mt-4"
          disabled={saving || sites.length === 0 || policies.length === 0}
        >
          <Plus className="size-4" /> {saving ? "Generando…" : "Crear lote"}
        </Button>
      </form>

      {lastCodes.length > 0 ? (
        <Card className="mb-4 border-emerald-100 bg-emerald-50/60 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-extrabold text-emerald-900">Códigos generados ahora</p>
              <p className="mt-1 text-xs text-emerald-800/75">
                Guárdalos ahora: por seguridad no se vuelven a mostrar completos.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={downloadCodes}>
              <Download className="size-3.5" /> Descargar TXT
            </Button>
          </div>
          <pre className="mt-3 max-h-48 overflow-auto rounded-xl bg-white p-3 text-xs font-bold text-slate-700">
            {lastCodes.join("\n")}
          </pre>
        </Card>
      ) : null}

      <TableFrame title="Lotes de vouchers" subtitle={`${batches.length} lotes registrados`}>
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70">
              {["Lote", "Sede", "Servicio", "Disponibles", "Usados", "Caduca"].map((item) => (
                <th
                  key={item}
                  className="px-5 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400"
                >
                  {item}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {batches.map((batch) => (
              <tr key={batch.id} className="hover:bg-slate-50/70">
                <td className="px-5 py-4 text-xs font-extrabold text-slate-900">{batch.name}</td>
                <td className="px-5 py-4 text-xs text-slate-600">
                  {batch.siteName} · {batch.siteCode}
                </td>
                <td className="px-5 py-4 text-xs text-slate-600">{batch.policyName}</td>
                <td className="px-5 py-4">
                  <Badge variant={batch.available > 0 ? "success" : "neutral"} dot>
                    {batch.available} / {batch.quantity}
                  </Badge>
                </td>
                <td className="px-5 py-4 text-xs font-semibold text-slate-600">{batch.used}</td>
                <td className="px-5 py-4 text-xs text-slate-600">
                  {new Date(batch.expiresAt).toLocaleString("es-ES")}
                </td>
              </tr>
            ))}
            {batches.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">
                  Crea una sede y una política para emitir los primeros vouchers.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </TableFrame>
    </>
  );
}
