"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Building2,
  Check,
  Eye,
  Languages,
  Palette,
  Pencil,
  Plus,
  RefreshCcw,
  Rocket,
  Smartphone,
  Sparkles,
  Trash2,
  Wifi,
  type LucideIcon,
} from "lucide-react";

import { Badge, Button, Card } from "@wifi/ui";

import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { EditDialog } from "@/components/edit-dialog";
import { PageHeader } from "@/components/page-header";
import { adminApi, inputClass } from "../admin-api";

interface PortalPublicationView {
  id: string;
  siteId: string;
  siteName: string;
  startsAt: string;
  endsAt: string | null;
  active: boolean;
}

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
  redirectUrl: string | null;
  primaryColor: string | null;
  siteNames: string[];
  publications: PortalPublicationView[];
  createdAt: string;
}

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

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(new Error("No se pudo leer el logo")));
    reader.readAsDataURL(file);
  });
}

async function logoValue(data: FormData): Promise<string | undefined> {
  const file = data.get("logoFile");
  if (file instanceof File && file.size > 0) {
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)) {
      throw new Error("El logo debe ser PNG, JPG, WEBP o SVG");
    }
    if (file.size > 200_000) throw new Error("El logo no puede superar 200 KB");
    return fileToDataUrl(file);
  }
  return String(data.get("logoUrl") || "") || undefined;
}

function defaultHeadline(portal: PortalView): string {
  return portal.headline ?? `Bienvenido a ${portal.name}`;
}

function defaultBody(portal: PortalView): string {
  return portal.body ?? "Introduce tus datos para acceder a Internet.";
}

function portalColor(portal: PortalView): string {
  return portal.primaryColor ?? "#0d9488";
}

export default function PortalsPage() {
  const [portals, setPortals] = useState<PortalView[]>([]);
  const [sites, setSites] = useState<SiteView[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingPortal, setEditingPortal] = useState<PortalView | null>(null);
  const [deletingPortal, setDeletingPortal] = useState<PortalView | null>(null);

  const activePublications = useMemo(
    () =>
      portals.flatMap((portal) => portal.publications.filter((publication) => publication.active)),
    [portals],
  );

  async function refresh(): Promise<void> {
    setError(null);
    const [nextPortals, nextSites] = await Promise.all([
      adminApi<PortalView[]>("/api/v1/admin/portals"),
      adminApi<SiteView[]>("/api/v1/admin/sites"),
    ]);
    setPortals(nextPortals);
    setSites(nextSites);
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
          logoUrl: await logoValue(data),
          redirectUrl: data.get("redirectUrl") || undefined,
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
          logoUrl: await logoValue(data),
          redirectUrl: data.get("redirectUrl") || undefined,
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

  async function publishPortal(portal: PortalView, siteId: string): Promise<void> {
    if (!siteId) {
      setError("Selecciona una sede para publicar el portal");
      return;
    }
    setPublishingId(portal.id);
    setError(null);
    try {
      await adminApi(`/api/v1/admin/portals/${portal.id}/publish`, {
        method: "POST",
        body: JSON.stringify({ siteId }),
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo publicar el portal");
    } finally {
      setPublishingId(null);
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
        description="Diseña la experiencia WiFi de cada cliente y publícala en su sede en un clic."
        actions={
          <Button variant="secondary" onClick={() => void refresh()}>
            <RefreshCcw className="size-4" /> Actualizar
          </Button>
        }
      />

      <section className="mb-6 overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-950 text-white shadow-2xl shadow-slate-950/10">
        <div className="relative grid gap-6 p-6 lg:grid-cols-[1.2fr_.8fr] lg:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(45,212,191,.28),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(59,130,246,.24),transparent_30%)]" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-bold text-teal-100 backdrop-blur">
              <Sparkles className="size-3.5" /> Multi-cliente desde captive.wpass.es
            </span>
            <h2 className="mt-5 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">
              Un dominio común, una marca distinta para cada sede.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              WPass detecta el gateway que abre la sesión y sirve el portal publicado para esa sede:
              logo, color, textos y experiencia de acceso.
            </p>
          </div>
          <div className="relative grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <Metric label="Portales" value={String(portals.length)} />
            <Metric label="Sedes disponibles" value={String(sites.length)} />
            <Metric label="Publicaciones activas" value={String(activePublications.length)} />
          </div>
        </div>
      </section>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Info icon={Smartphone} title="Mobile-first" text="Preview pensado para móvil" />
        <Info icon={Building2} title="Por sede" text="Cada cliente puede tener su marca" />
        <Info icon={Rocket} title="Publicación 1 clic" text="Activa el portal en producción" />
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      <form
        onSubmit={(event) => void createPortal(event)}
        className="mb-6 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm"
      >
        <div className="border-b border-slate-100 bg-gradient-to-r from-white to-slate-50 px-5 py-4">
          <h2 className="text-sm font-black text-slate-950">Nuevo portal de cliente</h2>
          <p className="mt-1 text-xs text-slate-500">
            Empieza por los datos básicos. Después publícalo en la sede que corresponda.
          </p>
        </div>
        <div className="grid gap-3 p-5 lg:grid-cols-3">
          <input
            name="name"
            required
            placeholder="Nombre interno, ej. Hotel Costa"
            className={inputClass}
          />
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
            name="redirectUrl"
            type="url"
            placeholder="Redirección final, ej. https://www.entelsat.com/"
            className={inputClass}
          />
          <input
            name="logoFile"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className={`${inputClass} py-2`}
          />
          <input
            name="primaryColor"
            pattern="^#[0-9a-fA-F]{6}$"
            placeholder="Color principal #0d9488"
            className={inputClass}
          />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4">
          <p className="text-xs text-slate-500">
            El logo se guarda en el portal y se muestra al usuario final.
          </p>
          <Button type="submit" disabled={saving}>
            <Plus className="size-4" /> {saving ? "Creando…" : "Crear portal"}
          </Button>
        </div>
      </form>

      <div className="grid gap-6 xl:grid-cols-2">
        {portals.map((portal) => (
          <PortalCard
            key={portal.id}
            portal={portal}
            sites={sites}
            publishing={publishingId === portal.id}
            onEdit={() => setEditingPortal(portal)}
            onDelete={() => setDeletingPortal(portal)}
            onPublish={(siteId) => void publishPortal(portal, siteId)}
          />
        ))}

        {portals.length === 0 ? (
          <div className="grid min-h-[320px] place-items-center rounded-[2rem] border-2 border-dashed border-slate-200 bg-white/50 p-8 text-center xl:col-span-2">
            <span>
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-500">
                <Palette className="size-6" />
              </span>
              <span className="mt-4 block text-sm font-extrabold text-slate-900">
                Todavía no hay portales
              </span>
              <span className="mt-1 block max-w-xs text-xs leading-5 text-slate-500">
                Crea el primero con el formulario superior y publícalo en gatewaycasa.
              </span>
            </span>
          </div>
        ) : null}
      </div>

      <EditDialog
        open={editingPortal !== null}
        title="Editar portal cautivo"
        description="Cambia textos, logo y color en una sola ventana. Después publícalo en la sede."
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
              Título visible
              <input
                name="headline"
                defaultValue={editingPortal.headline ?? "Bienvenido al WiFi"}
                className={inputClass}
              />
            </label>
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              Texto visible
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
                Redirección tras acceder
                <input
                  name="redirectUrl"
                  type="url"
                  defaultValue={editingPortal.redirectUrl ?? "https://www.entelsat.com/"}
                  className={inputClass}
                />
                <span className="font-medium leading-5 text-slate-500">
                  Página a la que irá el cliente cuando MikroTik le dé acceso.
                </span>
              </label>
              <label className="grid gap-1.5 text-xs font-bold text-slate-700">
                Subir logo
                <input
                  name="logoFile"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className={`${inputClass} py-2`}
                />
                <span className="font-medium leading-5 text-slate-500">
                  Opcional. Si subes archivo sustituye a la URL.
                </span>
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

function PortalCard({
  portal,
  sites,
  publishing,
  onEdit,
  onDelete,
  onPublish,
}: {
  portal: PortalView;
  sites: SiteView[];
  publishing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onPublish: (siteId: string) => void;
}) {
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const activeSites = portal.publications.filter((publication) => publication.active);
  const selectedSite = selectedSiteId || sites[0]?.id || "";

  return (
    <Card className="overflow-hidden rounded-[2rem] border-slate-200 bg-white shadow-sm">
      <div className="grid lg:grid-cols-[.9fr_1.1fr]">
        <div
          className="relative min-h-[360px] overflow-hidden p-6 text-white"
          style={{
            background: `radial-gradient(circle at 20% 20%, ${portalColor(
              portal,
            )}55, transparent 34%), linear-gradient(145deg, #020617 0%, #0f172a 52%, ${portalColor(
              portal,
            )} 130%)`,
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(255,255,255,.22),transparent_28%)]" />
          <Badge
            variant={portal.status === "published" ? "success" : "warning"}
            className="relative"
            dot
          >
            {portal.status === "published" ? "Publicado" : "Borrador"}
          </Badge>
          <div className="relative mx-auto mt-8 w-[230px] rounded-[2.3rem] border border-white/15 bg-white/10 p-2 shadow-2xl shadow-black/30 backdrop-blur">
            <div className="overflow-hidden rounded-[1.85rem] bg-white text-slate-950">
              <div className="h-20" style={{ backgroundColor: portalColor(portal) }} />
              <div className="-mt-8 px-5 pb-6 text-center">
                <span className="mx-auto grid size-16 place-items-center rounded-2xl border border-slate-100 bg-white shadow-xl">
                  {portal.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={portal.logoUrl}
                      alt={portal.name}
                      className="size-11 object-contain"
                    />
                  ) : (
                    <Wifi className="size-7" style={{ color: portalColor(portal) }} />
                  )}
                </span>
                <h3 className="mt-5 text-base font-black tracking-tight">
                  {defaultHeadline(portal)}
                </h3>
                <p className="mt-2 text-xs leading-5 text-slate-500">{defaultBody(portal)}</p>
                <span
                  className="mt-5 block rounded-2xl px-4 py-3 text-xs font-black text-white shadow-lg"
                  style={{ backgroundColor: portalColor(portal) }}
                >
                  Acceder a Internet
                </span>
                <span className="mt-3 block truncate text-[10px] font-semibold text-slate-400">
                  Después: {portal.redirectUrl ?? "https://www.entelsat.com/"}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-950">{portal.name}</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                v{portal.version ?? 1} · {portal.fallbackLocale.toUpperCase()} · {portal.kind}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={onEdit}>
                <Pencil className="size-3.5" /> Editar
              </Button>
              <Button variant="ghost" size="sm" onClick={onDelete}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-slate-500">
              <Eye className="size-4" /> Publicación
            </div>
            {activeSites.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {activeSites.map((publication) => (
                  <span
                    key={publication.id}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200"
                  >
                    <span className="size-2 rounded-full bg-emerald-500" />
                    {publication.siteName}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm font-semibold text-slate-600">
                Todavía no está activo en ninguna sede.
              </p>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
              <select
                value={selectedSite}
                onChange={(event) => setSelectedSiteId(event.target.value)}
                className={inputClass}
                disabled={sites.length === 0}
              >
                {sites.length === 0 ? <option value="">Crea una sede primero</option> : null}
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name} · {site.gatewaysOnline}/{site.gatewaysTotal} gateways online
                  </option>
                ))}
              </select>
              <Button
                onClick={() => onPublish(selectedSite)}
                disabled={publishing || sites.length === 0}
                className="bg-slate-950 hover:bg-slate-800"
              >
                <Rocket className="size-4" /> {publishing ? "Publicando…" : "Publicar"}
              </Button>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              Al publicar, este portal sustituye al portal activo de esa sede. Los usuarios nuevos
              que entren por sus gateways verán esta marca automáticamente.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
      <span className="block text-2xl font-black">{value}</span>
      <span className="mt-1 block text-xs font-semibold text-slate-300">{label}</span>
    </div>
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
