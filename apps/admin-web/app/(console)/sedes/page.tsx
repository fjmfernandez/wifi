"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowUpRight, Download, MapPin, Plus, Router, UsersRound } from "lucide-react";

import { Badge, Button } from "@wifi/ui";

import { PageHeader } from "@/components/page-header";
import { TableFrame } from "@/components/table-frame";

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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Error HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export default function SitesPage() {
  const [sites, setSites] = useState<SiteView[]>([]);
  const [gateways, setGateways] = useState<GatewayView[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSite, setSavingSite] = useState(false);
  const [savingGateway, setSavingGateway] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setError(null);
    const [nextSites, nextGateways] = await Promise.all([
      api<SiteView[]>("/api/v1/admin/sites"),
      api<GatewayView[]>("/api/v1/admin/gateways"),
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
      await api<SiteView>("/api/v1/admin/sites", {
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
      await api<GatewayView>("/api/v1/admin/gateways", {
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
            <input name="name" required placeholder="Nombre de la sede" className="input" />
            <input name="code" required placeholder="Código, ej. HOTEL-01" className="input" />
            <input name="countryCode" defaultValue="ES" maxLength={2} className="input" />
            <input name="timezone" defaultValue="Europe/Madrid" className="input" />
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
            <select name="siteId" required defaultValue={firstSiteId} className="input">
              <option value="" disabled>
                Selecciona sede
              </option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
            <input name="name" required placeholder="Nombre del gateway" className="input" />
            <input
              name="nasIdentifier"
              required
              placeholder="NAS Identifier único"
              className="input"
            />
            <input name="model" placeholder="Modelo, ej. RB5009" className="input" />
            <input name="serial" placeholder="Serie" className="input sm:col-span-2" />
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
                  <div className="flex justify-end">
                    <button
                      aria-label={`Abrir ${site.name}`}
                      className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-white hover:text-brand-700"
                    >
                      <ArrowUpRight className="size-4" />
                    </button>
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
                </tr>
              ))}
              {!loading && gateways.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-500">
                    Registra un gateway cuando ya tengas una sede.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </TableFrame>
      </div>
    </>
  );
}
