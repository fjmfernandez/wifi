"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, FileDown, KeyRound, Plus, Printer, QrCode, RefreshCcw } from "lucide-react";
import { toDataURL } from "qrcode";

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
  downloadKbps: number | null;
  uploadKbps: number | null;
  sessionTimeoutSeconds: number | null;
  quotaBytes: string | null;
  maxConcurrentDevices: number | null;
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

interface VoucherTicket {
  code: string;
  batchName: string;
  siteName: string;
  policyName: string;
  policyLimits: string;
  expiresAt: string;
  maxUses: number;
  maxDevices: number;
}

function mbps(kbps: number | null): string {
  if (!kbps) return "sin límite";
  return `${Math.round(kbps / 1000)} Mbps`;
}

function gb(bytes: string | null): string {
  if (!bytes) return "sin cuota";
  return `${Math.round(Number(bytes) / 1024 ** 3)} GB`;
}

function hours(seconds: number | null): string {
  if (!seconds) return "sin caducidad de sesión";
  return `${Math.round(seconds / 3600)} h de sesión`;
}

function policyLimits(policy: PolicyView | undefined): string {
  if (!policy) return "Sin servicio seleccionado";
  return [
    `Bajada ${mbps(policy.downloadKbps)}`,
    `Subida ${mbps(policy.uploadKbps)}`,
    hours(policy.sessionTimeoutSeconds),
    gb(policy.quotaBytes),
    `${policy.maxConcurrentDevices ?? 1} dispositivo(s)`,
  ].join(" · ");
}

export default function VouchersPage() {
  const [sites, setSites] = useState<SiteView[]>([]);
  const [policies, setPolicies] = useState<PolicyView[]>([]);
  const [batches, setBatches] = useState<VoucherBatchView[]>([]);
  const [lastCodes, setLastCodes] = useState<string[]>([]);
  const [ticket, setTicket] = useState<VoucherTicket | null>(null);
  const [ticketQr, setTicketQr] = useState<string | null>(null);
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

  useEffect(() => {
    if (!ticket) {
      setTicketQr(null);
      return;
    }
    void toDataURL(ticket.code, { margin: 1, scale: 7, errorCorrectionLevel: "M" })
      .then(setTicketQr)
      .catch(() => setTicketQr(null));
  }, [ticket]);

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
      const codes = created.oneTimeCodes ?? [];
      setLastCodes(codes);
      const selectedSite = sites.find((site) => site.id === String(data.get("siteId")));
      const selectedPolicy = policies.find(
        (policy) => policy.versionId === String(data.get("policyVersionId")),
      );
      if (codes.length === 1) {
        setTicket({
          code: codes[0] ?? "",
          batchName: created.name,
          siteName: selectedSite?.name ?? created.siteName,
          policyName: selectedPolicy?.name ?? created.policyName,
          policyLimits: policyLimits(selectedPolicy),
          expiresAt: created.expiresAt,
          maxUses: Number(data.get("defaultMaxUses") || 1),
          maxDevices: Number(data.get("defaultMaxDevices") || 1),
        });
      }
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
        description="Crea códigos de acceso WiFi. Para entregar a un cliente, genera cantidad 1 e imprime el ticket con QR."
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
        className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:hidden"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">
              Crear voucher individual o lote
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Cantidad 1 crea un ticket para un cliente. Cantidad mayor crea un lote para descargar
              en TXT.
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-[11px] font-bold text-brand-700">
            <QrCode className="size-3.5" /> QR automático si cantidad = 1
          </span>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1.5 text-xs font-bold text-slate-700">
            Nombre interno
            <input
              name="name"
              required
              placeholder="Ej. Cliente recepción habitación 204"
              className={inputClass}
            />
            <span className="font-medium leading-5 text-slate-500">
              Sirve para localizar el voucher en el histórico.
            </span>
          </label>
          <label className="grid gap-1.5 text-xs font-bold text-slate-700">
            Sede donde funcionará
            <select name="siteId" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Selecciona sede
              </option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
            <span className="font-medium leading-5 text-slate-500">
              El código solo debe entregarse para esta sede.
            </span>
          </label>
          <label className="grid gap-1.5 text-xs font-bold text-slate-700 xl:col-span-2">
            Servicio / límites
            <select name="policyVersionId" required defaultValue="" className={inputClass}>
              <option value="" disabled>
                Selecciona servicio
              </option>
              {policies.map((policy) => (
                <option key={policy.id} value={policy.versionId ?? ""}>
                  {policy.name} · {policyLimits(policy)}
                </option>
              ))}
            </select>
            <span className="font-medium leading-5 text-slate-500">
              Aquí ves si tiene límites de bajada/subida, cuota, duración y dispositivos.
            </span>
          </label>
          <label className="grid gap-1.5 text-xs font-bold text-slate-700">
            Cantidad
            <input
              name="quantity"
              required
              type="number"
              min={1}
              max={250}
              defaultValue={1}
              className={inputClass}
            />
            <span className="font-medium leading-5 text-slate-500">
              Usa 1 para un cliente y poder imprimir QR.
            </span>
          </label>
          <label className="grid gap-1.5 text-xs font-bold text-slate-700">
            Caduca el
            <input name="expiresAt" required type="datetime-local" className={inputClass} />
            <span className="font-medium leading-5 text-slate-500">
              Fecha límite para usar el voucher.
            </span>
          </label>
          <label className="grid gap-1.5 text-xs font-bold text-slate-700">
            Usos permitidos
            <input
              name="defaultMaxUses"
              type="number"
              min={1}
              defaultValue={1}
              className={inputClass}
            />
            <span className="font-medium leading-5 text-slate-500">
              Normalmente 1 para entregar a una persona.
            </span>
          </label>
          <label className="grid gap-1.5 text-xs font-bold text-slate-700">
            Dispositivos
            <input
              name="defaultMaxDevices"
              type="number"
              min={1}
              defaultValue={1}
              className={inputClass}
            />
            <span className="font-medium leading-5 text-slate-500">
              Cuántos móviles/portátiles puede asociar.
            </span>
          </label>
        </div>
        <Button
          type="submit"
          className="mt-4"
          disabled={saving || sites.length === 0 || policies.length === 0}
        >
          <Plus className="size-4" /> {saving ? "Generando…" : "Crear voucher"}
        </Button>
      </form>

      {ticket ? (
        <Card className="mb-4 overflow-hidden border-brand-100 bg-white print:fixed print:inset-0 print:z-50 print:m-0 print:rounded-none print:border-0 print:p-0">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between print:hidden">
            <div>
              <p className="text-sm font-extrabold text-slate-900">Ticket listo para entregar</p>
              <p className="mt-1 text-xs text-slate-500">
                El QR contiene el código del voucher. También se imprime el código por si el cliente
                lo introduce manualmente.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer className="size-3.5" /> Imprimir ticket
            </Button>
          </div>
          <div className="mx-auto max-w-md border-t border-slate-100 p-6 text-center print:border-0 print:p-10">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-brand-700">
              ENTELSAT WiFi
            </p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">{ticket.siteName}</h2>
            <p className="mt-1 text-xs text-slate-500">{ticket.batchName}</p>
            <div className="mx-auto mt-5 grid size-52 place-items-center rounded-3xl border border-slate-200 bg-slate-50 p-3">
              {ticketQr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ticketQr} alt={`QR voucher ${ticket.code}`} className="size-full" />
              ) : (
                <QrCode className="size-16 text-slate-300" />
              )}
            </div>
            <p className="mt-5 text-xs font-bold uppercase tracking-wider text-slate-400">
              Código de acceso
            </p>
            <p className="mt-1 font-mono text-3xl font-black tracking-[0.18em] text-slate-950">
              {ticket.code}
            </p>
            <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-left text-xs leading-5 text-slate-600">
              <p>
                <span className="font-extrabold text-slate-800">Servicio:</span> {ticket.policyName}
              </p>
              <p>
                <span className="font-extrabold text-slate-800">Límites:</span>{" "}
                {ticket.policyLimits}
              </p>
              <p>
                <span className="font-extrabold text-slate-800">Usos:</span> {ticket.maxUses} ·{" "}
                <span className="font-extrabold text-slate-800">Dispositivos:</span>{" "}
                {ticket.maxDevices}
              </p>
              <p>
                <span className="font-extrabold text-slate-800">Caduca:</span>{" "}
                {new Date(ticket.expiresAt).toLocaleString("es-ES")}
              </p>
            </div>
          </div>
        </Card>
      ) : null}

      {lastCodes.length > 0 ? (
        <Card className="mb-4 border-emerald-100 bg-emerald-50/60 p-4 print:hidden">
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
              {["Lote", "Sede", "Servicio y límites", "Disponibles", "Usados", "Caduca"].map(
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
            {batches.map((batch) => (
              <tr key={batch.id} className="hover:bg-slate-50/70">
                <td className="px-5 py-4 text-xs font-extrabold text-slate-900">{batch.name}</td>
                <td className="px-5 py-4 text-xs text-slate-600">
                  {batch.siteName} · {batch.siteCode}
                </td>
                <td className="px-5 py-4 text-xs text-slate-600">
                  <span className="font-extrabold text-slate-800">{batch.policyName}</span>
                  <span className="mt-1 block text-[11px] leading-4 text-slate-500">
                    Consulta los límites exactos en Servicios.
                  </span>
                </td>
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
