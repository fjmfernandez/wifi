"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Archive, Building2, Pencil, Plus, RefreshCcw } from "lucide-react";

import { Badge, Button } from "@wifi/ui";

import { EditDialog } from "@/components/edit-dialog";
import { PageHeader } from "@/components/page-header";
import { TableFrame } from "@/components/table-frame";
import { adminApi, inputClass } from "../admin-api";

interface OrganizationView {
  id: string;
  code: string;
  name: string;
  legalName: string | null;
  status: string;
  sitesTotal: number;
  createdAt: string;
}

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<OrganizationView[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingOrganization, setEditingOrganization] = useState<OrganizationView | null>(null);

  async function refresh(): Promise<void> {
    setError(null);
    setOrganizations(await adminApi<OrganizationView[]>("/api/v1/admin/organizations"));
  }

  useEffect(() => {
    void refresh()
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : "No se pudieron cargar organizaciones"),
      )
      .finally(() => setLoading(false));
  }, []);

  async function createOrganization(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      await adminApi<OrganizationView>("/api/v1/admin/organizations", {
        method: "POST",
        body: JSON.stringify({
          code: data.get("code"),
          name: data.get("name"),
          legalName: data.get("legalName") || undefined,
        }),
      });
      event.currentTarget.reset();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear la organización");
    } finally {
      setSaving(false);
    }
  }

  async function submitEditOrganization(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editingOrganization) return;
    setSavingEdit(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      await adminApi<OrganizationView>(`/api/v1/admin/organizations/${editingOrganization.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: data.get("name"),
          code: data.get("code"),
          legalName: data.get("legalName") || undefined,
        }),
      });
      setEditingOrganization(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo editar la organización");
    } finally {
      setSavingEdit(false);
    }
  }

  async function archiveOrganization(organization: OrganizationView): Promise<void> {
    if (!window.confirm(`¿Archivar ${organization.name}?`)) return;
    try {
      await adminApi<{ archived: boolean }>(`/api/v1/admin/organizations/${organization.id}`, {
        method: "DELETE",
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo archivar la organización");
    }
  }

  return (
    <>
      <PageHeader
        title="Organizaciones"
        description="Clientes, cadenas o grupos contractuales dentro del tenant."
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
        onSubmit={(event) => void createOrganization(event)}
        className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h2 className="text-sm font-extrabold text-slate-900">Crear organización</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <input name="name" required placeholder="Nombre comercial" className={inputClass} />
          <input name="code" required placeholder="Código, ej. ENTELSAT" className={inputClass} />
          <input name="legalName" placeholder="Razón social opcional" className={inputClass} />
        </div>
        <Button type="submit" className="mt-4" disabled={saving}>
          <Plus className="size-4" /> {saving ? "Creando…" : "Nueva organización"}
        </Button>
      </form>

      <TableFrame
        title="Organizaciones"
        subtitle={loading ? "Cargando…" : `${organizations.length} organizaciones`}
      >
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70">
              {["Organización", "Código", "Sedes", "Estado", "Acciones"].map((item) => (
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
            {organizations.map((organization) => (
              <tr key={organization.id} className="hover:bg-slate-50/70">
                <td className="px-5 py-4">
                  <span className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-700">
                      <Building2 className="size-4" />
                    </span>
                    <span>
                      <span className="block text-xs font-extrabold text-slate-900">
                        {organization.name}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {organization.legalName ?? "Sin razón social"}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="px-5 py-4 font-mono text-xs text-slate-600">{organization.code}</td>
                <td className="px-5 py-4 text-xs font-semibold text-slate-600">
                  {organization.sitesTotal}
                </td>
                <td className="px-5 py-4">
                  <Badge variant={organization.status === "active" ? "success" : "warning"} dot>
                    {organization.status}
                  </Badge>
                </td>
                <td className="px-5 py-4">
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingOrganization(organization)}
                    >
                      <Pencil className="size-3.5" /> Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void archiveOrganization(organization)}
                    >
                      <Archive className="size-3.5" /> Archivar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableFrame>

      <EditDialog
        open={editingOrganization !== null}
        title="Editar organización"
        description="Modifica todos los datos de la organización y guarda una sola vez."
        saving={savingEdit}
        onClose={() => setEditingOrganization(null)}
        onSubmit={() =>
          (
            document.getElementById("edit-organization-form") as HTMLFormElement | null
          )?.requestSubmit()
        }
      >
        {editingOrganization ? (
          <form
            id="edit-organization-form"
            onSubmit={(event) => void submitEditOrganization(event)}
            className="grid gap-3"
          >
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              Nombre comercial
              <input
                name="name"
                required
                defaultValue={editingOrganization.name}
                className={inputClass}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              Código
              <input
                name="code"
                required
                defaultValue={editingOrganization.code}
                className={inputClass}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              Razón social
              <input
                name="legalName"
                defaultValue={editingOrganization.legalName ?? ""}
                className={inputClass}
              />
            </label>
          </form>
        ) : null}
      </EditDialog>
    </>
  );
}
