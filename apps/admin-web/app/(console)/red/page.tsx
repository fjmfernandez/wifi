"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Archive, Pencil, Plus, RefreshCcw, Router, Wifi } from "lucide-react";

import { Badge, Button } from "@wifi/ui";

import { EditDialog } from "@/components/edit-dialog";
import { PageHeader } from "@/components/page-header";
import { TableFrame } from "@/components/table-frame";
import { adminApi, inputClass } from "../admin-api";

interface SiteView {
  id: string;
  name: string;
  code: string;
}

interface GatewayView {
  id: string;
  siteId: string;
  siteName: string;
  siteCode: string;
  name: string;
  model: string | null;
  serial: string | null;
  nasIdentifier: string;
  status: string;
  routerOsVersion: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

export default function NetworkPage() {
  const [sites, setSites] = useState<SiteView[]>([]);
  const [gateways, setGateways] = useState<GatewayView[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingGateway, setEditingGateway] = useState<GatewayView | null>(null);

  async function refresh(): Promise<void> {
    setError(null);
    const [nextSites, nextGateways] = await Promise.all([
      adminApi<SiteView[]>("/api/v1/admin/sites"),
      adminApi<GatewayView[]>("/api/v1/admin/gateways"),
    ]);
    setSites(nextSites);
    setGateways(nextGateways);
  }

  useEffect(() => {
    void refresh().catch((cause) =>
      setError(cause instanceof Error ? cause.message : "No se pudo cargar la red"),
    );
  }, []);

  async function createGateway(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      await adminApi<GatewayView>("/api/v1/admin/gateways", {
        method: "POST",
        body: JSON.stringify({
          siteId: data.get("siteId"),
          name: data.get("name"),
          nasIdentifier: data.get("nasIdentifier"),
          model: data.get("model") || undefined,
          serial: data.get("serial") || undefined,
        }),
      });
      event.currentTarget.reset();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar el gateway");
    } finally {
      setSaving(false);
    }
  }

  async function submitEditGateway(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editingGateway) return;
    setSavingEdit(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      await adminApi<GatewayView>(`/api/v1/admin/gateways/${editingGateway.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          siteId: data.get("siteId"),
          name: data.get("name"),
          nasIdentifier: data.get("nasIdentifier"),
          model: data.get("model") || undefined,
          serial: data.get("serial") || undefined,
          status: data.get("status") || undefined,
        }),
      });
      setEditingGateway(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo editar el gateway");
    } finally {
      setSavingEdit(false);
    }
  }

  async function archiveGateway(gateway: GatewayView): Promise<void> {
    if (!window.confirm(`¿Archivar ${gateway.name}?`)) return;
    try {
      await adminApi<{ archived: boolean }>(`/api/v1/admin/gateways/${gateway.id}`, {
        method: "DELETE",
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo archivar el gateway");
    }
  }

  return (
    <>
      <PageHeader
        title="Red y gateways"
        description="Alta inicial de routers/NAS para empezar a operar sedes WiFi."
        actions={
          <Button variant="secondary" onClick={() => void refresh()}>
            <RefreshCcw className="size-4" /> Actualizar
          </Button>
        }
      />

      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      <form
        onSubmit={(event) => void createGateway(event)}
        className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h2 className="text-sm font-extrabold text-slate-900">Registrar gateway</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
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
          <input name="name" required placeholder="Nombre" className={inputClass} />
          <input
            name="nasIdentifier"
            required
            placeholder="NAS Identifier"
            className={inputClass}
          />
          <input name="model" placeholder="Modelo" className={inputClass} />
          <input name="serial" placeholder="Serie" className={inputClass} />
        </div>
        <Button type="submit" className="mt-4" disabled={saving || sites.length === 0}>
          <Plus className="size-4" /> {saving ? "Registrando…" : "Registrar gateway"}
        </Button>
      </form>

      <TableFrame title="Gateways" subtitle={`${gateways.length} registrados`}>
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70">
              {["Gateway", "Sede", "NAS Identifier", "RouterOS", "Estado", "Acciones"].map(
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
            {gateways.map((gateway) => (
              <tr key={gateway.id} className="hover:bg-slate-50/70">
                <td className="px-5 py-4">
                  <span className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-700">
                      <Router className="size-4" />
                    </span>
                    <span>
                      <span className="block text-xs font-extrabold text-slate-900">
                        {gateway.name}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {[gateway.model, gateway.serial].filter(Boolean).join(" · ") ||
                          "Sin modelo"}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="px-5 py-4 text-xs text-slate-600">
                  {gateway.siteName} · {gateway.siteCode}
                </td>
                <td className="px-5 py-4 font-mono text-xs text-slate-600">
                  {gateway.nasIdentifier}
                </td>
                <td className="px-5 py-4 text-xs text-slate-600">
                  {gateway.routerOsVersion ?? "Pendiente"}
                </td>
                <td className="px-5 py-4">
                  <Badge variant={gateway.status === "online" ? "success" : "warning"} dot>
                    {gateway.status}
                  </Badge>
                </td>
                <td className="px-5 py-4">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditingGateway(gateway)}>
                      <Pencil className="size-3.5" /> Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void archiveGateway(gateway)}>
                      <Archive className="size-3.5" /> Archivar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {gateways.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">
                  <Wifi className="mx-auto mb-2 size-5 text-slate-300" />
                  Crea primero una sede y después registra aquí el gateway.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </TableFrame>

      <EditDialog
        open={editingGateway !== null}
        title="Editar gateway"
        description="Cambia todos los datos del RouterBOARD/NAS en una sola ventana."
        saving={savingEdit}
        onClose={() => setEditingGateway(null)}
        onSubmit={() =>
          (
            document.getElementById("edit-network-gateway-form") as HTMLFormElement | null
          )?.requestSubmit()
        }
      >
        {editingGateway ? (
          <form
            id="edit-network-gateway-form"
            onSubmit={(event) => void submitEditGateway(event)}
            className="grid gap-3 sm:grid-cols-2"
          >
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              Sede
              <select
                name="siteId"
                required
                defaultValue={editingGateway.siteId}
                className={inputClass}
              >
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              Nombre
              <input
                name="name"
                required
                defaultValue={editingGateway.name}
                className={inputClass}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              NAS Identifier
              <input
                name="nasIdentifier"
                required
                defaultValue={editingGateway.nasIdentifier}
                className={inputClass}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              Estado
              <select name="status" defaultValue={editingGateway.status} className={inputClass}>
                <option value="pending">pending</option>
                <option value="online">online</option>
                <option value="degraded">degraded</option>
                <option value="offline">offline</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              Modelo
              <input
                name="model"
                defaultValue={editingGateway.model ?? ""}
                className={inputClass}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              Serie
              <input
                name="serial"
                defaultValue={editingGateway.serial ?? ""}
                className={inputClass}
              />
            </label>
          </form>
        ) : null}
      </EditDialog>
    </>
  );
}
