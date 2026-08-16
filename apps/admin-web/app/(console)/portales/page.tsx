import {
  Check,
  ChevronRight,
  Copy,
  Eye,
  Globe2,
  Languages,
  MoreHorizontal,
  Palette,
  Plus,
  Rocket,
  Smartphone,
} from "lucide-react";

import { Badge, Button, Card } from "@wifi/ui";

import { PageHeader } from "@/components/page-header";

const portals = [
  {
    name: "Portal principal · Miramar",
    site: "Hotel Miramar Málaga",
    version: "v12",
    languages: "ES · EN",
    updated: "Hace 42 min",
    status: "Publicado",
    gradient: "from-[#0d385f] via-[#196f91] to-[#23a9ad]",
  },
  {
    name: "Piscina & Beach Club",
    site: "Hotel Miramar Málaga",
    version: "v4",
    languages: "ES · EN",
    updated: "Ayer, 18:20",
    status: "Publicado",
    gradient: "from-[#153d58] via-[#267493] to-[#f5b76b]",
  },
  {
    name: "Costa Sur · Verano",
    site: "Hotel Costa Sur",
    version: "v8",
    languages: "ES · EN · DE",
    updated: "14 ago 2026",
    status: "Borrador",
    gradient: "from-[#24365b] via-[#705a8f] to-[#e29573]",
  },
];

export default function PortalsPage() {
  return (
    <>
      <PageHeader
        title="Portales cautivos"
        description="Crea experiencias ligeras, accesibles y multidioma con publicación versionada y rollback inmediato."
        actions={
          <Button>
            <Plus className="size-4" /> Nuevo portal
          </Button>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-700">
            <Smartphone className="size-4" />
          </span>
          <span>
            <span className="block text-xs font-extrabold text-slate-900">Mobile-first</span>
            <span className="text-[11px] text-slate-500">Optimizado para CNA</span>
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <span className="grid size-9 place-items-center rounded-xl bg-violet-50 text-violet-700">
            <Languages className="size-4" />
          </span>
          <span>
            <span className="block text-xs font-extrabold text-slate-900">Idiomas por sede</span>
            <span className="text-[11px] text-slate-500">Fallback determinista</span>
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <Check className="size-4" />
          </span>
          <span>
            <span className="block text-xs font-extrabold text-slate-900">WCAG 2.2 AA</span>
            <span className="text-[11px] text-slate-500">Contraste y teclado</span>
          </span>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
        {portals.map((portal) => (
          <Card key={portal.name} className="overflow-hidden">
            <div className={`relative h-52 overflow-hidden bg-gradient-to-br ${portal.gradient}`}>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_65%_20%,rgba(255,255,255,.25),transparent_30%)]" />
              <div className="absolute left-1/2 top-1/2 w-40 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white/95 p-4 text-center shadow-2xl">
                <span className="mx-auto grid size-9 place-items-center rounded-xl bg-slate-900 text-[10px] font-black text-white">
                  HM
                </span>
                <p className="mt-2 text-[9px] font-extrabold text-slate-900">
                  Bienvenido a Miramar
                </p>
                <p className="mt-1 text-[6px] leading-3 text-slate-400">
                  Conéctate al WiFi del hotel
                </p>
                <span className="mt-3 block rounded-md bg-brand-600 py-1.5 text-[6px] font-bold text-white">
                  Acceder a Internet
                </span>
              </div>
              <Badge
                variant={portal.status === "Publicado" ? "success" : "warning"}
                className="absolute left-4 top-4"
                dot
              >
                {portal.status}
              </Badge>
              <button
                aria-label="Previsualizar"
                className="absolute right-4 top-4 grid size-8 place-items-center rounded-xl bg-white/15 text-white backdrop-blur hover:bg-white/25"
              >
                <Eye className="size-4" />
              </button>
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-extrabold text-slate-900">{portal.name}</h2>
                  <p className="mt-1 text-xs text-slate-500">{portal.site}</p>
                </div>
                <button aria-label="Más opciones" className="text-slate-400">
                  <MoreHorizontal className="size-5" />
                </button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1">
                  <Rocket className="size-3" />
                  {portal.version}
                </span>
                <span className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1">
                  <Globe2 className="size-3" />
                  {portal.languages}
                </span>
                <span>{portal.updated}</span>
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                <Button variant="ghost" size="sm">
                  <Copy className="size-3.5" /> Clonar
                </Button>
                <Button variant="secondary" size="sm">
                  Editar portal <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
        <button className="grid min-h-[420px] place-items-center rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 p-8 text-center hover:border-brand-300 hover:bg-brand-50/30">
          <span>
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-500">
              <Palette className="size-5" />
            </span>
            <span className="mt-4 block text-sm font-extrabold text-slate-900">
              Diseñar nuevo portal
            </span>
            <span className="mt-1 block max-w-xs text-xs leading-5 text-slate-500">
              Parte de una plantilla accesible y adapta marca, textos y métodos de acceso.
            </span>
          </span>
        </button>
      </div>
    </>
  );
}
