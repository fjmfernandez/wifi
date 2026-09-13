"use client";

import {
  Building2,
  CheckCircle2,
  CircleOff,
  Download,
  Mail,
  Router,
  Search,
  ShieldCheck,
  TicketCheck,
  UsersRound,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge, Button, Card } from "@wifi/ui";

import { adminApi } from "../admin-api";

type OrganizationView = {
  id: string;
  name: string;
  accessEmail: string | null;
  marketingAccessEnabled: boolean;
  sitesTotal: number;
};

type SiteView = {
  id: string;
  name: string;
  code: string;
  gatewaysTotal: number;
  gatewaysOnline: number;
};

type GatewayView = {
  id: string;
  name: string;
  siteName: string;
  nasIdentifier: string;
  status: string;
  routerOsVersion: string | null;
  lastSeenAt: string | null;
};

type MarketingContact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  marketingConsent: "granted" | "rejected" | "withdrawn" | "not_requested";
  organizationName: string | null;
  lastSiteName: string | null;
  lastSeenAt: string | null;
  visits: number;
};

type VoucherBatchView = {
  id: string;
  name: string;
  siteName: string;
  available: number;
  used: number;
};

function formatDate(value: string | null): string {
  if (!value) return "Sin actividad";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function isOnline(gateway: GatewayView): boolean {
  if (gateway.status === "online") return true;
  if (!gateway.lastSeenAt) return false;
  return Date.now() - new Date(gateway.lastSeenAt).getTime() < 5 * 60_000;
}

export default function HotelClientsPage() {
  const [organizations, setOrganizations] = useState<OrganizationView[]>([]);
  const [sites, setSites] = useState<SiteView[]>([]);
  const [gateways, setGateways] = useState<GatewayView[]>([]);
  const [contacts, setContacts] = useState<MarketingContact[]>([]);
  const [vouchers, setVouchers] = useState<VoucherBatchView[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(undefined);
      try {
        const [nextOrganizations, nextSites, nextGateways, nextContacts, nextVouchers] =
          await Promise.all([
            adminApi<OrganizationView[]>("/api/v1/admin/organizations"),
            adminApi<SiteView[]>("/api/v1/admin/sites"),
            adminApi<GatewayView[]>("/api/v1/admin/gateways"),
            adminApi<MarketingContact[]>("/api/v1/admin/marketing/contacts"),
            adminApi<VoucherBatchView[]>("/api/v1/admin/voucher-batches"),
          ]);
        setOrganizations(nextOrganizations);
        setSites(nextSites);
        setGateways(nextGateways);
        setContacts(nextContacts);
        setVouchers(nextVouchers);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "No se pudo cargar el panel");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const onlineGateways = gateways.filter(isOnline).length;
  const registeredUsers = contacts.length;
  const marketingUsers = contacts.filter((contact) => contact.marketingConsent === "granted").length;
  const totalVoucherStock = vouchers.reduce((sum, batch) => sum + batch.available, 0);

  const filteredContacts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return contacts;
    return contacts.filter((contact) =>
      [
        contact.firstName,
        contact.lastName,
        contact.email,
        contact.organizationName,
        contact.lastSiteName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [contacts, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-brand-600">
            Panel para hoteles
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">
            Control limpio de clientes, equipos y marketing
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Vista preparada para cada hotel: solo muestra sus sedes, gateways, usuarios registrados
            y vouchers reales. Sin datos demo ni nombres de prueba.
          </p>
        </div>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Actualizar estado
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={Building2}
          label="Organizaciones"
          value={String(organizations.length)}
          detail={`${sites.length} sede(s) activa(s)`}
        />
        <KpiCard
          icon={Router}
          label="Gateways conectados"
          value={`${onlineGateways}/${gateways.length}`}
          detail="Verde cuando el equipo envía actividad reciente"
        />
        <KpiCard
          icon={UsersRound}
          label="Usuarios registrados"
          value={String(registeredUsers)}
          detail={`${marketingUsers} con consentimiento marketing`}
        />
        <KpiCard
          icon={TicketCheck}
          label="Vouchers disponibles"
          value={String(totalVoucherStock)}
          detail="Stock listo para imprimir o entregar"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black tracking-[-0.03em] text-slate-950">
                  Equipo instalado
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Routers y sedes visibles para el hotel.
                </p>
              </div>
              <Badge variant={onlineGateways > 0 ? "success" : "warning"} dot>
                {onlineGateways > 0 ? "Conectado" : "Sin conexión"}
              </Badge>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.14em] text-slate-400">
                <tr>
                  <th className="px-5 py-3">Gateway</th>
                  <th className="px-5 py-3">Sede</th>
                  <th className="px-5 py-3">NAS</th>
                  <th className="px-5 py-3">RouterOS</th>
                  <th className="px-5 py-3">Última señal</th>
                  <th className="px-5 py-3">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                      Cargando equipo…
                    </td>
                  </tr>
                ) : gateways.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                      No hay gateways activos. Crea o vincula el gateway casa para empezar.
                    </td>
                  </tr>
                ) : (
                  gateways.map((gateway) => (
                    <tr key={gateway.id} className="bg-white">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="grid size-10 place-items-center rounded-2xl bg-slate-100 text-slate-600">
                            <Wifi className="size-5" />
                          </span>
                          <span>
                            <span className="block font-bold text-slate-950">{gateway.name}</span>
                            <span className="text-xs text-slate-400">RouterBOARD</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{gateway.siteName}</td>
                      <td className="px-5 py-4 font-mono text-xs text-slate-500">
                        {gateway.nasIdentifier}
                      </td>
                      <td className="px-5 py-4 text-slate-500">
                        {gateway.routerOsVersion ?? "Pendiente"}
                      </td>
                      <td className="px-5 py-4 text-slate-500">
                        {formatDate(gateway.lastSeenAt)}
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={isOnline(gateway) ? "success" : "warning"} dot>
                          {isOnline(gateway) ? "Conectado" : gateway.status}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid gap-4">
          <Card className="p-5">
            <h2 className="text-lg font-black tracking-[-0.03em] text-slate-950">
              Resumen por sede
            </h2>
            <div className="mt-5 grid gap-3">
              {sites.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                  No hay sedes activas.
                </p>
              ) : (
                sites.map((site) => (
                  <div key={site.id} className="rounded-2xl border border-slate-100 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-950">{site.name}</p>
                        <p className="mt-1 text-xs text-slate-400">{site.code}</p>
                      </div>
                      <Badge variant={site.gatewaysOnline > 0 ? "success" : "neutral"} dot>
                        {site.gatewaysOnline}/{site.gatewaysTotal} online
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-black tracking-[-0.03em] text-slate-950">
              Acceso marketing
            </h2>
            <div className="mt-5 grid gap-3">
              {organizations.map((organization) => (
                <div key={organization.id} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-950">{organization.name}</p>
                    <p className="text-xs text-slate-400">
                      {organization.accessEmail ?? "Sin email de acceso"}
                    </p>
                  </div>
                  <Badge variant={organization.marketingAccessEnabled ? "success" : "neutral"} dot>
                    {organization.marketingAccessEnabled ? "Habilitado" : "Desactivado"}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </section>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-black tracking-[-0.03em] text-slate-950">
              Usuarios captados para marketing
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Personas que se han registrado desde el portal cautivo.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar nombre, email o sede"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-100 sm:w-72"
              />
            </label>
            <Button
              variant="secondary"
              onClick={() => {
                const rows = [
                  ["nombre", "apellidos", "email", "sede", "visitas", "consentimiento"],
                  ...contacts.map((contact) => [
                    contact.firstName ?? "",
                    contact.lastName ?? "",
                    contact.email ?? "",
                    contact.lastSiteName ?? "",
                    String(contact.visits),
                    contact.marketingConsent,
                  ]),
                ];
                const csv = rows
                  .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
                  .join("\n");
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `wpass-clientes-${new Date().toISOString().slice(0, 10)}.csv`;
                link.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="size-4" />
              Exportar
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-[0.14em] text-slate-400">
              <tr>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Sede</th>
                <th className="px-5 py-3">Visitas</th>
                <th className="px-5 py-3">Último acceso</th>
                <th className="px-5 py-3">Marketing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">
                    Cargando usuarios…
                  </td>
                </tr>
              ) : filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center">
                    <div className="mx-auto max-w-sm">
                      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-500">
                        <Mail className="size-5" />
                      </span>
                      <p className="mt-3 text-sm font-bold text-slate-800">
                        Todavía no hay registros
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Cuando un cliente acepte los términos y se conecte con email aparecerá aquí.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredContacts.map((contact) => (
                  <tr key={contact.id} className="bg-white">
                    <td className="px-5 py-4">
                      <div className="font-bold text-slate-950">
                        {[contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
                          "Sin nombre"}
                      </div>
                      <div className="text-xs text-slate-400">
                        {contact.organizationName ?? "Organización"}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{contact.email ?? "—"}</td>
                    <td className="px-5 py-4 text-slate-600">{contact.lastSiteName ?? "—"}</td>
                    <td className="px-5 py-4 text-slate-600">{contact.visits}</td>
                    <td className="px-5 py-4 text-slate-500">{formatDate(contact.lastSeenAt)}</td>
                    <td className="px-5 py-4">
                      <Badge
                        variant={contact.marketingConsent === "granted" ? "success" : "warning"}
                        dot
                      >
                        {contact.marketingConsent === "granted" ? (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="size-3" /> Aceptado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <CircleOff className="size-3" /> Pendiente
                          </span>
                        )}
                      </Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
        <span className="inline-flex items-center gap-2 font-bold">
          <ShieldCheck className="size-4" />
          Preparado para clientes
        </span>
        <span className="mt-1 block">
          Este panel se puede entregar a cada hotel con permisos limitados para ver únicamente su
          marketing, sus vouchers, sus usuarios y el estado de sus equipos.
        </span>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <span className="grid size-11 place-items-center rounded-2xl bg-brand-50 text-brand-700">
          <Icon className="size-5" />
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Live
        </span>
      </div>
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 text-3xl font-black tracking-[-0.05em] text-slate-950">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </Card>
  );
}
