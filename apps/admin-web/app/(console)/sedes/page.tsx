"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, MapPin, Pencil, Plus, Router, Trash2, UsersRound } from "lucide-react";

import { Badge, Button } from "@wifi/ui";

import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { EditDialog } from "@/components/edit-dialog";
import { PageHeader } from "@/components/page-header";
import { TableFrame } from "@/components/table-frame";
import { adminApi, inputClass } from "../admin-api";

interface SiteView {
  id: string;
  code: string;
  name: string;
  status: string;
  timezone: string;
  countryCode: string;
  gatewaysTotal: number;
  gatewaysOnline: number;
  createdAt: string;
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

export default function SitesPage() {
  const [sites, setSites] = useState<SiteView[]>([]);
  const [gateways, setGateways] = useState<GatewayView[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSite, setSavingSite] = useState(false);
  const [savingGateway, setSavingGateway] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingSite, setEditingSite] = useState<SiteView | null>(null);
  const [editingGateway, setEditingGateway] = useState<GatewayView | null>(null);
  const [deletingSite, setDeletingSite] = useState<SiteView | null>(null);
  const [deletingGateway, setDeletingGateway] = useState<GatewayView | null>(null);

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
    void refresh()
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "No se pudieron cargar los datos"),
      )
      .finally(() => setLoading(false));
  }, []);

  const firstSiteId = useMemo(() => sites[0]?.id ?? "", [sites]);

  async function createSite(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSavingSite(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      await adminApi<SiteView>("/api/v1/admin/sites", {
        method: "POST",
        body: JSON.stringify({
          name: data.get("name"),
          code: data.get("code"),
          countryCode: data.get("countryCode") || "ES",
          timezone: data.get("timezone") || "Europe/Madrid",
        }),
      });
      event.currentTarget.reset();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear la sede");
    } finally {
      setSavingSite(false);
    }
  }

  async function createGateway(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSavingGateway(true);
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
      setError(cause instanceof Error ? cause.message : "No se pudo crear el gateway");
    } finally {
      setSavingGateway(false);
    }
  }

  async function submitEditSite(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editingSite) return;
    setSavingEdit(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      await adminApi<SiteView>(`/api/v1/admin/sites/${editingSite.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: data.get("name"),
          code: data.get("code"),
          countryCode: data.get("countryCode") || "ES",
          timezone: data.get("timezone") || "Europe/Madrid",
        }),
      });
      setEditingSite(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo editar la sede");
    } finally {
      setSavingEdit(false);
    }
  }

  async function archiveSite(site: SiteView): Promise<void> {
    try {
      await adminApi<{ archived: boolean }>(`/api/v1/admin/sites/${site.id}`, {
        method: "DELETE",
      });
      setDeletingSite(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo borrar la sede");
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
    try {
      await adminApi<{ archived: boolean }>(`/api/v1/admin/gateways/${gateway.id}`, {
        method: "DELETE",
      });
      setDeletingGateway(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo borrar el gateway");
    }
  }

  return (
    <>
      <PageHeader
        title="Sedes"
        description="Gestiona establecimientos y gateways reales guardados en PostgreSQL."
        actions={
          <Button variant="secondary" onClick={() => void refresh()}>
            <Download className="size-4" /> Actualizar
          </Button>
        }
      />

      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <form
          onSubmit={(event) => void createSite(event)}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h2 className="text-sm font-extrabold text-slate-900">Crear sede</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input name="name" required placeholder="Nombre de la sede" className={inputClass} />
            <input name="code" required placeholder="Código, ej. HOTEL-01" className={inputClass} />
            <input name="countryCode" defaultValue="ES" maxLength={2} className={inputClass} />
            <input name="timezone" defaultValue="Europe/Madrid" className={inputClass} />
          </div>
          <Button type="submit" className="mt-4" disabled={savingSite}>
            <Plus className="size-4" /> {savingSite ? "Creando…" : "Nueva sede"}
          </Button>
        </form>

        <form
          onSubmit={(event) => void createGateway(event)}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h2 className="text-sm font-extrabold text-slate-900">Registrar gateway</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <select name="siteId" required defaultValue={firstSiteId} className={inputClass}>
              <option value="" disabled>
                Selecciona sede
              </option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
            <input name="name" required placeholder="Nombre del gateway" className={inputClass} />
            <input
              name="nasIdentifier"
              required
              placeholder="NAS Identifier único"
              className={inputClass}
            />
            <input name="model" placeholder="Modelo, ej. RB5009" className={inputClass} />
            <input name="serial" placeholder="Serie" className={`${inputClass} sm:col-span-2`} />
          </div>
          <Button type="submit" className="mt-4" disabled={savingGateway || sites.length === 0}>
            <Router className="size-4" /> {savingGateway ? "Registrando…" : "Registrar gateway"}
          </Button>
        </form>
      </div>

      <TableFrame
        title="Todas las sedes"
        subtitle={loading ? "Cargando…" : `${sites.length} sedes · ${gateways.length} gateways`}
      >
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
                Zona horaria
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
              <tr key={site.id} className="hover:bg-slate-50/70">
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
                        {site.countryCode} · {site.code}
                      </span>
                    </span>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <Router className="size-3.5 text-slate-400" />
                    {site.gatewaysOnline} / {site.gatewaysTotal}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <UsersRound className="size-3.5 text-slate-400" />0
                  </span>
                </td>
                <td className="px-5 py-4 text-xs font-semibold text-slate-600">{site.timezone}</td>
                <td className="px-5 py-4">
                  <Badge variant={site.status === "active" ? "success" : "warning"} dot>
                    {site.status}
                  </Badge>
                </td>
                <td className="px-5 py-4">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditingSite(site)}>
                      <Pencil className="size-3.5" /> Editar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeletingSite(site)}>
                      <Trash2 className="size-3.5" /> Borrar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && sites.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-500">
                  Todavía no hay sedes. Crea la primera arriba.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </TableFrame>

      <div className="mt-4">
        <TableFrame title="Gateways registrados" subtitle="Routers MikroTik/NAS asociados a sedes">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                <th className="px-5 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Gateway
                </th>
                <th className="px-5 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Sede
                </th>
                <th className="px-5 py-3 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  NAS
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
              {gateways.map((gateway) => (
                <tr key={gateway.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-4 text-xs font-extrabold text-slate-900">
                    {gateway.name}
                    <span className="mt-1 block text-[11px] font-semibold text-slate-500">
                      {[gateway.model, gateway.serial].filter(Boolean).join(" · ") || "Sin modelo"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-600">{gateway.siteName}</td>
                  <td className="px-5 py-4 font-mono text-xs text-slate-600">
                    {gateway.nasIdentifier}
                  </td>
                  <td className="px-5 py-4">
                    <Badge variant={gateway.status === "online" ? "success" : "warning"} dot>
                      {gateway.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditingGateway(gateway)}>
                        <Pencil className="size-3.5" /> Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeletingGateway(gateway)}>
                        <Trash2 className="size-3.5" /> Borrar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && gateways.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-500">
                    Registra un gateway cuando ya tengas una sede.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </TableFrame>
      </div>

      <EditDialog
        open={editingSite !== null}
        title="Editar sede"
        description="Modifica los datos principales de la sede."
        saving={savingEdit}
        onClose={() => setEditingSite(null)}
        onSubmit={() =>
          (document.getElementById("edit-site-form") as HTMLFormElement | null)?.requestSubmit()
        }
      >
        {editingSite ? (
          <form
            id="edit-site-form"
            onSubmit={(event) => void submitEditSite(event)}
            className="grid gap-3 sm:grid-cols-2"
          >
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              Nombre de la sede
              <input name="name" required defaultValue={editingSite.name} className={inputClass} />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              Código
              <input name="code" required defaultValue={editingSite.code} className={inputClass} />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              País
              <input
                name="countryCode"
                required
                maxLength={2}
                defaultValue={editingSite.countryCode}
                className={inputClass}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              Zona horaria
              <input
                name="timezone"
                required
                defaultValue={editingSite.timezone}
                className={inputClass}
              />
            </label>
          </form>
        ) : null}
      </EditDialog>

      <EditDialog
        open={editingGateway !== null}
        title="Editar gateway"
        description="Modifica sede, NAS Identifier, modelo y estado en una sola ventana."
        saving={savingEdit}
        onClose={() => setEditingGateway(null)}
        onSubmit={() =>
          (
            document.getElementById("edit-sites-gateway-form") as HTMLFormElement | null
          )?.requestSubmit()
        }
      >
        {editingGateway ? (
          <form
            id="edit-sites-gateway-form"
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

      <DeleteConfirmDialog
        open={deletingSite !== null}
        title="Borrar sede"
        itemName={deletingSite?.name ?? ""}
        description="Se retirará la sede de las listas activas. Escribe eliminar para confirmar."
        onCancel={() => setDeletingSite(null)}
        onConfirm={() => (deletingSite ? void archiveSite(deletingSite) : undefined)}
      />

      <DeleteConfirmDialog
        open={deletingGateway !== null}
        title="Borrar gateway"
        itemName={deletingGateway?.name ?? ""}
        description="Se retirará el gateway de las listas activas. Escribe eliminar para confirmar."
        onCancel={() => setDeletingGateway(null)}
        onConfirm={() => (deletingGateway ? void archiveGateway(deletingGateway) : undefined)}
      />
    </>
  );
}
