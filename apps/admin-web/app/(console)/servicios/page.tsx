"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  Clock3,
  Gauge,
  HardDrive,
  Pencil,
  Plus,
  Radio,
  Smartphone,
  Trash2,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { Badge, Button, Card } from "@wifi/ui";

import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { EditDialog } from "@/components/edit-dialog";
import { PageHeader } from "@/components/page-header";
import { adminApi, inputClass } from "../admin-api";

interface PolicyView {
  id: string;
  name: string;
  status: string;
  versionId: string | null;
  version: number | null;
  versionStatus: string | null;
  downloadKbps: number | null;
  uploadKbps: number | null;
  sessionTimeoutSeconds: number | null;
  quotaBytes: string | null;
  maxConcurrentDevices: number | null;
  createdAt: string;
}

function mbps(kbps: number | null): string {
  if (!kbps) return "Sin límite";
  return `${Math.round(kbps / 1000)} Mbps`;
}

function gb(bytes: string | null): string {
  if (!bytes) return "Sin cuota";
  return `${Math.round(Number(bytes) / 1024 ** 3)} GB`;
}

export default function ServicesPage() {
  const [policies, setPolicies] = useState<PolicyView[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingPolicy, setEditingPolicy] = useState<PolicyView | null>(null);
  const [deletingPolicy, setDeletingPolicy] = useState<PolicyView | null>(null);

  async function refresh(): Promise<void> {
    setError(null);
    setPolicies(await adminApi<PolicyView[]>("/api/v1/admin/policies"));
  }

  useEffect(() => {
    void refresh().catch((cause) =>
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar políticas"),
    );
  }, []);

  async function createPolicy(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      await adminApi<PolicyView>("/api/v1/admin/policies", {
        method: "POST",
        body: JSON.stringify({
          name: data.get("name"),
          downloadKbps: Number(data.get("downloadMbps") || 0) * 1000 || undefined,
          uploadKbps: Number(data.get("uploadMbps") || 0) * 1000 || undefined,
          sessionTimeoutHours: data.get("sessionTimeoutHours"),
          quotaGb: data.get("quotaGb") || undefined,
          maxConcurrentDevices: data.get("maxConcurrentDevices") || 1,
        }),
      });
      event.currentTarget.reset();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear la política");
    } finally {
      setSaving(false);
    }
  }

  async function submitEditPolicy(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editingPolicy) return;
    setSavingEdit(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const downloadMbps = String(data.get("downloadMbps") ?? "");
    const uploadMbps = String(data.get("uploadMbps") ?? "");
    try {
      await adminApi<PolicyView>(`/api/v1/admin/policies/${editingPolicy.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: data.get("name"),
          downloadKbps: downloadMbps ? Number(downloadMbps) * 1000 : undefined,
          uploadKbps: uploadMbps ? Number(uploadMbps) * 1000 : undefined,
          sessionTimeoutHours: data.get("sessionTimeoutHours") || undefined,
          quotaGb: data.get("quotaGb") || undefined,
          maxConcurrentDevices: data.get("maxConcurrentDevices") || undefined,
        }),
      });
      setEditingPolicy(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo editar la política");
    } finally {
      setSavingEdit(false);
    }
  }

  async function archivePolicy(policy: PolicyView): Promise<void> {
    try {
      await adminApi<{ archived: boolean }>(`/api/v1/admin/policies/${policy.id}`, {
        method: "DELETE",
      });
      setDeletingPolicy(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo borrar la política");
    }
  }

  return (
    <>
      <PageHeader
        title="Servicios y políticas"
        description="Define límites de velocidad, tiempo, consumo y concurrencia."
        actions={
          <Button variant="secondary" onClick={() => void refresh()}>
            Actualizar
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs text-sky-800">
        <Radio className="size-4 shrink-0" />
        <span>
          Cada política se crea con una versión publicada inicial, lista para asociarla a vouchers.
        </span>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      <form
        onSubmit={(event) => void createPolicy(event)}
        className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h2 className="text-sm font-extrabold text-slate-900">Crear política</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <input name="name" required placeholder="Nombre" className={inputClass} />
          <input
            name="downloadMbps"
            type="number"
            placeholder="Bajada Mbps"
            className={inputClass}
          />
          <input name="uploadMbps" type="number" placeholder="Subida Mbps" className={inputClass} />
          <input
            name="sessionTimeoutHours"
            type="number"
            defaultValue={24}
            placeholder="Horas"
            className={inputClass}
          />
          <input name="quotaGb" type="number" placeholder="GB" className={inputClass} />
          <input
            name="maxConcurrentDevices"
            type="number"
            defaultValue={1}
            placeholder="Dispositivos"
            className={inputClass}
          />
        </div>
        <Button type="submit" className="mt-4" disabled={saving}>
          <Plus className="size-4" /> {saving ? "Creando…" : "Nueva política"}
        </Button>
      </form>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {policies.map((policy) => (
          <Card key={policy.id} className="group overflow-hidden">
            <div className="h-1.5 bg-gradient-to-r from-brand-500 to-brand-700" />
            <div className="p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
                  <Zap className="size-4.5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-extrabold text-slate-900">{policy.name}</h2>
                    <Badge variant="brand">v{policy.version ?? 1}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Estado {policy.versionStatus}</p>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4 rounded-xl bg-slate-50 p-4">
                <Metric
                  icon={Gauge}
                  label="Velocidad"
                  value={`${mbps(policy.downloadKbps)} / ${mbps(policy.uploadKbps)}`}
                />
                <Metric
                  icon={Clock3}
                  label="Duración"
                  value={`${Math.round((policy.sessionTimeoutSeconds ?? 0) / 3600)} h`}
                />
                <Metric icon={HardDrive} label="Cuota" value={gb(policy.quotaBytes)} />
                <Metric
                  icon={Smartphone}
                  label="Dispositivos"
                  value={`${policy.maxConcurrentDevices ?? 1}`}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => setEditingPolicy(policy)}>
                  <Pencil className="size-3.5" /> Editar y publicar v{(policy.version ?? 1) + 1}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeletingPolicy(policy)}>
                  <Trash2 className="size-3.5" /> Borrar
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <EditDialog
        open={editingPolicy !== null}
        title="Editar servicio / política"
        description="Publica una nueva versión con todos los límites actualizados."
        saving={savingEdit}
        onClose={() => setEditingPolicy(null)}
        onSubmit={() =>
          (document.getElementById("edit-policy-form") as HTMLFormElement | null)?.requestSubmit()
        }
      >
        {editingPolicy ? (
          <form
            id="edit-policy-form"
            onSubmit={(event) => void submitEditPolicy(event)}
            className="grid gap-3 sm:grid-cols-2"
          >
            <label className="grid gap-1.5 text-xs font-bold text-slate-700 sm:col-span-2">
              Nombre
              <input
                name="name"
                required
                defaultValue={editingPolicy.name}
                className={inputClass}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              Bajada Mbps
              <input
                name="downloadMbps"
                type="number"
                min={0}
                defaultValue={
                  editingPolicy.downloadKbps
                    ? Math.round(editingPolicy.downloadKbps / 1000)
                    : undefined
                }
                className={inputClass}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              Subida Mbps
              <input
                name="uploadMbps"
                type="number"
                min={0}
                defaultValue={
                  editingPolicy.uploadKbps ? Math.round(editingPolicy.uploadKbps / 1000) : undefined
                }
                className={inputClass}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              Horas de sesión
              <input
                name="sessionTimeoutHours"
                type="number"
                min={1}
                defaultValue={Math.round((editingPolicy.sessionTimeoutSeconds ?? 86_400) / 3600)}
                className={inputClass}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              Cuota GB
              <input
                name="quotaGb"
                type="number"
                min={0}
                defaultValue={
                  editingPolicy.quotaBytes
                    ? Math.round(Number(editingPolicy.quotaBytes) / 1024 ** 3)
                    : undefined
                }
                className={inputClass}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              Dispositivos simultáneos
              <input
                name="maxConcurrentDevices"
                type="number"
                min={1}
                defaultValue={editingPolicy.maxConcurrentDevices ?? 1}
                className={inputClass}
              />
            </label>
          </form>
        ) : null}
      </EditDialog>

      <DeleteConfirmDialog
        open={deletingPolicy !== null}
        title="Borrar servicio / política"
        itemName={deletingPolicy?.name ?? ""}
        description="Se retirará la política de las listas activas. Escribe eliminar para confirmar."
        onCancel={() => setDeletingPolicy(null)}
        onConfirm={() => (deletingPolicy ? void archivePolicy(deletingPolicy) : undefined)}
      />
    </>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 text-slate-400" />
      <span>
        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {label}
        </span>
        <span className="mt-1 block text-xs font-extrabold text-slate-700">{value}</span>
      </span>
    </div>
  );
}
