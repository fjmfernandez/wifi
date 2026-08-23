"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  Check,
  Eye,
  Languages,
  Palette,
  Pencil,
  Plus,
  RefreshCcw,
  Smartphone,
  Trash2,
  type LucideIcon,
} from "lucide-react";

import { Badge, Button, Card } from "@wifi/ui";

import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { EditDialog } from "@/components/edit-dialog";
import { PageHeader } from "@/components/page-header";
import { adminApi, inputClass } from "../admin-api";

interface PortalView {
  id: string;
  name: string;
  kind: string;
  versionId: string | null;
  version: number | null;
  status: string;
  fallbackLocale: string;
  headline: string | null;
  body: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  siteNames: string[];
  createdAt: string;
}

export default function PortalsPage() {
  const [portals, setPortals] = useState<PortalView[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingPortal, setEditingPortal] = useState<PortalView | null>(null);
  const [deletingPortal, setDeletingPortal] = useState<PortalView | null>(null);

  async function refresh(): Promise<void> {
    setError(null);
    setPortals(await adminApi<PortalView[]>("/api/v1/admin/portals"));
  }

  useEffect(() => {
    void refresh().catch((cause) =>
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar portales"),
    );
  }, []);

  async function createPortal(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      await adminApi<PortalView>("/api/v1/admin/portals", {
        method: "POST",
        body: JSON.stringify({
          name: data.get("name"),
          headline: data.get("headline") || undefined,
          body: data.get("body") || undefined,
          logoUrl: data.get("logoUrl") || undefined,
          primaryColor: data.get("primaryColor") || undefined,
        }),
      });
      event.currentTarget.reset();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo crear el portal");
    } finally {
      setSaving(false);
    }
  }

  async function submitEditPortal(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editingPortal) return;
    setSavingEdit(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      await adminApi<PortalView>(`/api/v1/admin/portals/${editingPortal.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: data.get("name"),
          headline: data.get("headline") || undefined,
          body: data.get("body") || undefined,
          logoUrl: data.get("logoUrl") || undefined,
          primaryColor: data.get("primaryColor") || undefined,
        }),
      });
      setEditingPortal(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo editar el portal");
    } finally {
      setSavingEdit(false);
    }
  }

  async function archivePortal(portal: PortalView): Promise<void> {
    try {
      await adminApi<{ archived: boolean }>(`/api/v1/admin/portals/${portal.id}`, {
        method: "DELETE",
      });
      setDeletingPortal(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo borrar el portal");
    }
  }

  return (
    <>
      <PageHeader
        title="Portales cautivos"
        description="Crea portales WiFi versionados con textos iniciales listos para publicar."
        actions={
          <Button variant="secondary" onClick={() => void refresh()}>
            <RefreshCcw className="size-4" /> Actualizar
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Info icon={Smartphone} title="Mobile-first" text="Preparado para portal cautivo móvil" />
        <Info icon={Languages} title="Idioma base" text="Fallback inicial en español" />
        <Info icon={Check} title="Versionado" text="Cada portal nace con versión editable" />
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      <form
        onSubmit={(event) => void createPortal(event)}
        className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h2 className="text-sm font-extrabold text-slate-900">Crear portal</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <input name="name" required placeholder="Nombre del portal" className={inputClass} />
          <input
            name="headline"
            placeholder="Título, ej. Bienvenido al WiFi"
            className={inputClass}
          />
          <input name="body" placeholder="Texto corto para el cliente" className={inputClass} />
          <input
            name="logoUrl"
            type="url"
            placeholder="Logo público https://..."
            className={inputClass}
          />
          <input
            name="primaryColor"
            pattern="^#[0-9a-fA-F]{6}$"
            placeholder="Color principal #0d9488"
            className={inputClass}
          />
        </div>
        <Button type="submit" className="mt-4" disabled={saving}>
          <Plus className="size-4" /> {saving ? "Creando…" : "Nuevo portal"}
        </Button>
      </form>

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {portals.map((portal) => (
          <Card key={portal.id} className="overflow-hidden">
            <div className="relative h-52 overflow-hidden bg-gradient-to-br from-[#0d385f] via-[#196f91] to-[#23a9ad]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_20%,rgba(255,255,255,.25),transparent_30%)]" />
              <div className="absolute left-1/2 top-1/2 w-44 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white/95 p-4 text-center shadow-2xl">
                {portal.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={portal.logoUrl}
                    alt={portal.name}
                    className="mx-auto size-9 rounded-xl object-contain"
                  />
                ) : (
                  <span className="mx-auto grid size-9 place-items-center rounded-xl bg-slate-900 text-[10px] font-black text-white">
                    WiFi
                  </span>
                )}
                <p className="mt-2 text-[10px] font-extrabold text-slate-900">
                  {portal.headline ?? portal.name}
                </p>
                <p className="mt-1 text-[7px] leading-3 text-slate-400">
                  {portal.body ?? "Conéctate al servicio WiFi de la sede"}
                </p>
                <span
                  className="mt-3 block rounded-md bg-brand-600 py-1.5 text-[7px] font-bold text-white"
                  style={portal.primaryColor ? { backgroundColor: portal.primaryColor } : undefined}
                >
                  Acceder a Internet
                </span>
              </div>
              <Badge
                variant={portal.status === "published" ? "success" : "warning"}
                className="absolute left-4 top-4"
                dot
              >
                {portal.status}
              </Badge>
              <span className="absolute right-4 top-4 grid size-8 place-items-center rounded-xl bg-white/15 text-white backdrop-blur">
                <Eye className="size-4" />
              </span>
            </div>
            <div className="p-5">
              <h2 className="text-sm font-extrabold text-slate-900">{portal.name}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {portal.siteNames.length > 0
                  ? portal.siteNames.join(", ")
                  : "Pendiente de publicar en una sede"}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span className="rounded-lg bg-slate-100 px-2 py-1">v{portal.version ?? 1}</span>
                <span className="rounded-lg bg-slate-100 px-2 py-1">
                  {portal.fallbackLocale.toUpperCase()}
                </span>
                <span className="rounded-lg bg-slate-100 px-2 py-1">{portal.kind}</span>
              </div>
              <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4">
                <Button variant="secondary" size="sm" onClick={() => setEditingPortal(portal)}>
                  <Pencil className="size-3.5" /> Editar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeletingPortal(portal)}>
                  <Trash2 className="size-3.5" /> Borrar
                </Button>
              </div>
            </div>
          </Card>
        ))}

        {portals.length === 0 ? (
          <div className="grid min-h-[260px] place-items-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 p-8 text-center">
            <span>
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-500">
                <Palette className="size-5" />
              </span>
              <span className="mt-4 block text-sm font-extrabold text-slate-900">
                Todavía no hay portales
              </span>
              <span className="mt-1 block max-w-xs text-xs leading-5 text-slate-500">
                Crea el primero con el formulario superior.
              </span>
            </span>
          </div>
        ) : null}
      </div>

      <EditDialog
        open={editingPortal !== null}
        title="Editar portal cautivo"
        description="Personaliza textos, logo y color del portal en una sola ventana."
        saving={savingEdit}
        onClose={() => setEditingPortal(null)}
        onSubmit={() =>
          (document.getElementById("edit-portal-form") as HTMLFormElement | null)?.requestSubmit()
        }
      >
        {editingPortal ? (
          <form
            id="edit-portal-form"
            onSubmit={(event) => void submitEditPortal(event)}
            className="grid gap-3"
          >
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              Nombre del portal
              <input
                name="name"
                required
                defaultValue={editingPortal.name}
                className={inputClass}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              Título
              <input
                name="headline"
                defaultValue={editingPortal.headline ?? "Bienvenido al WiFi"}
                className={inputClass}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              Texto
              <textarea
                name="body"
                defaultValue={
                  editingPortal.body ?? "Acepta las condiciones para acceder a Internet."
                }
                className={`${inputClass} min-h-24 py-3`}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-bold text-slate-700">
                URL pública del logo
                <input
                  name="logoUrl"
                  type="url"
                  defaultValue={editingPortal.logoUrl ?? ""}
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1.5 text-xs font-bold text-slate-700">
                Color principal
                <input
                  name="primaryColor"
                  pattern="^#[0-9a-fA-F]{6}$"
                  defaultValue={editingPortal.primaryColor ?? "#0d9488"}
                  className={inputClass}
                />
              </label>
            </div>
          </form>
        ) : null}
      </EditDialog>

      <DeleteConfirmDialog
        open={deletingPortal !== null}
        title="Borrar portal cautivo"
        itemName={deletingPortal?.name ?? ""}
        description="Se retirará el portal de las listas activas. Escribe eliminar para confirmar."
        onCancel={() => setDeletingPortal(null)}
        onConfirm={() => (deletingPortal ? void archivePortal(deletingPortal) : undefined)}
      />
    </>
  );
}

function Info({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-700">
        <Icon className="size-4" />
      </span>
      <span>
        <span className="block text-xs font-extrabold text-slate-900">{title}</span>
        <span className="text-[11px] text-slate-500">{text}</span>
      </span>
    </div>
  );
}
