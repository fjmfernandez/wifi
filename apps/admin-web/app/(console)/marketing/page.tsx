"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Mail,
  RefreshCcw,
  Send,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import { Badge, Button, Card } from "@wifi/ui";

import { PageHeader } from "@/components/page-header";
import { adminApi, inputClass } from "../admin-api";

interface MarketingContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  marketingConsent: "granted" | "rejected" | "withdrawn" | "not_requested";
  consentAt: string | null;
  visits: number;
  organizationName: string | null;
  lastSiteName: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}

function consentLabel(value: MarketingContact["marketingConsent"]): string {
  if (value === "granted") return "Consentido";
  if (value === "rejected") return "Rechazado";
  if (value === "withdrawn") return "Revocado";
  return "No solicitado";
}

function csvEscape(value: unknown): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export default function MarketingPage() {
  const [contacts, setContacts] = useState<MarketingContact[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setError(null);
    setContacts(await adminApi<MarketingContact[]>("/api/v1/admin/marketing/contacts"));
  }

  useEffect(() => {
    void refresh().catch((cause) =>
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar contactos"),
    );
  }, []);

  const filtered = useMemo(() => {
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
        .some((value) => value!.toLowerCase().includes(normalized)),
    );
  }, [contacts, query]);

  const granted = contacts.filter((contact) => contact.marketingConsent === "granted").length;

  function exportCsv(): void {
    const rows = [
      [
        "nombre",
        "apellidos",
        "email",
        "marketing",
        "fecha_consentimiento",
        "visitas",
        "organizacion",
        "ultima_sede",
        "ultima_conexion",
      ],
      ...filtered.map((contact) => [
        contact.firstName ?? "",
        contact.lastName ?? "",
        contact.email ?? "",
        consentLabel(contact.marketingConsent),
        contact.consentAt ?? "",
        contact.visits,
        contact.organizationName ?? "",
        contact.lastSiteName ?? "",
        contact.lastSeenAt ?? "",
      ]),
    ];
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `wpass-marketing-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="Marketing"
        description="Contactos capturados desde organizaciones con Marketing habilitado y consentimiento trazable."
        actions={
          <>
            <Button variant="secondary" onClick={() => void refresh()}>
              <RefreshCcw className="size-4" /> Actualizar
            </Button>
            <Button onClick={exportCsv}>
              <Download className="size-4" /> Exportar CSV
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <Metric icon={UsersRound} label="Contactos con email" value={String(contacts.length)} />
        <Metric icon={ShieldCheck} label="Consentimiento marketing" value={String(granted)} />
        <Metric
          icon={Send}
          label="Listos para campañas"
          value={String(granted)}
          hint="Usar solo consentidos"
        />
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      <Card>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, email o sede"
            className={`${inputClass} sm:max-w-sm`}
          />
          <p className="text-xs font-semibold text-slate-500">
            {filtered.length} de {contacts.length} contactos
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1020px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-3 pr-4">Contacto</th>
                <th className="py-3 pr-4">Email</th>
                <th className="py-3 pr-4">Marketing</th>
                <th className="py-3 pr-4">Visitas</th>
                <th className="py-3 pr-4">Organización</th>
                <th className="py-3 pr-4">Última sede</th>
                <th className="py-3">Última conexión</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact) => (
                <tr key={contact.id} className="border-b border-slate-50">
                  <td className="py-3 pr-4 font-bold text-slate-900">
                    {[contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
                      "Sin nombre"}
                  </td>
                  <td className="py-3 pr-4 text-slate-600">
                    <span className="inline-flex items-center gap-2">
                      <Mail className="size-3.5 text-slate-400" />
                      {contact.email ?? "—"}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge
                      variant={contact.marketingConsent === "granted" ? "success" : "warning"}
                      dot
                    >
                      {consentLabel(contact.marketingConsent)}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{contact.visits}</td>
                  <td className="py-3 pr-4 text-slate-600">{contact.organizationName ?? "—"}</td>
                  <td className="py-3 pr-4 text-slate-600">{contact.lastSiteName ?? "—"}</td>
                  <td className="py-3 text-slate-600">{formatDate(contact.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <span className="flex items-center gap-2 text-xs font-bold text-slate-500">
        <Icon className="size-4 text-brand-600" />
        {label}
      </span>
      <span className="mt-2 block text-2xl font-black text-slate-950">{value}</span>
      {hint ? <span className="mt-1 block text-[11px] text-slate-400">{hint}</span> : null}
    </div>
  );
}
