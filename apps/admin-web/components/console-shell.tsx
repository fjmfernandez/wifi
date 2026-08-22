"use client";

import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  Cable,
  ChevronDown,
  CircleUserRound,
  FileCheck2,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  PanelTop,
  Search,
  Settings,
  ShieldBan,
  SlidersHorizontal,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Badge, Brand, cn } from "@wifi/ui";

type NavigationItem = { href: string; label: string; icon: LucideIcon; badge?: string };

const primaryNavigation: NavigationItem[] = [
  { href: "/administracion", label: "Resumen", icon: LayoutDashboard },
  { href: "/organizaciones", label: "Organizaciones", icon: Building2 },
  { href: "/sedes", label: "Sedes", icon: PanelTop },
  { href: "/red", label: "Red y gateways", icon: Network, badge: "2" },
  { href: "/routerboard", label: "Vincular RB", icon: Cable },
  { href: "/portales", label: "Portales", icon: SlidersHorizontal },
  { href: "/servicios", label: "Servicios", icon: KeyRound },
];

const operationsNavigation: NavigationItem[] = [
  { href: "/usuarios", label: "Usuarios", icon: UsersRound },
  { href: "/sesiones", label: "Sesiones", icon: Activity },
  { href: "/vouchers", label: "Vouchers", icon: FileCheck2 },
  { href: "/dispositivos", label: "Autorizados y bloqueos", icon: ShieldBan },
  { href: "/estadisticas", label: "Estadísticas", icon: BarChart3 },
];

const governanceNavigation: NavigationItem[] = [
  { href: "/legal", label: "Legal y privacidad", icon: FileCheck2 },
  { href: "/auditoria", label: "Auditoría", icon: Activity },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
];

function NavGroup({
  label,
  items,
  onNavigate,
}: {
  label: string;
  items: NavigationItem[];
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  return (
    <div className="mb-6">
      <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <nav className="grid gap-1" aria-label={label}>
        {items.map(({ href, label: itemLabel, icon: Icon, badge }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition",
                active
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
              )}
            >
              <Icon
                className={cn(
                  "size-[17px]",
                  active ? "text-brand-300" : "text-slate-500 group-hover:text-slate-300",
                )}
                strokeWidth={1.9}
              />
              <span className="min-w-0 flex-1 truncate">{itemLabel}</span>
              {badge ? (
                <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] text-amber-300">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Sidebar({ close }: { close: () => void }) {
  return (
    <aside className="flex h-full w-[272px] flex-col border-r border-white/5 bg-[#07172f] px-4 py-5 text-white">
      <div className="flex items-center justify-between px-2">
        <Brand inverse />
        <button
          onClick={close}
          className="grid size-9 place-items-center rounded-xl text-slate-400 hover:bg-white/10 lg:hidden"
          aria-label="Cerrar menú"
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="mt-7 rounded-xl border border-white/8 bg-white/[0.04] p-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-brand-500/15 text-xs font-extrabold text-brand-200">
            GH
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold text-slate-100">
              Gran Hotel Miramar
            </span>
            <span className="mt-0.5 block text-[10px] text-slate-500">Tenant · Producción</span>
          </span>
          <ChevronDown className="size-3.5 text-slate-500" />
        </div>
      </div>
      <div className="mt-7 min-h-0 flex-1 overflow-y-auto pr-1">
        <NavGroup label="Gestión" items={primaryNavigation} onNavigate={close} />
        <NavGroup label="Operación" items={operationsNavigation} onNavigate={close} />
        <NavGroup label="Gobierno" items={governanceNavigation} onNavigate={close} />
      </div>
      <div className="mt-4 border-t border-white/8 pt-4">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-cyan-400 text-xs font-extrabold">
            FM
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold">Francisco M.</span>
            <span className="block truncate text-[10px] text-slate-500">Administrador</span>
          </span>
          <LogOut className="size-4 text-slate-500" />
        </div>
      </div>
    </aside>
  );
}

export function ConsoleShell({ children }: { children: ReactNode }) {
  const [mobileMenu, setMobileMenu] = useState(false);
  return (
    <div className="min-h-dvh bg-slate-50 lg:grid lg:grid-cols-[272px_1fr]">
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">
        <Sidebar close={() => setMobileMenu(false)} />
      </div>
      {mobileMenu ? (
        <button
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden"
          aria-label="Cerrar menú"
          onClick={() => setMobileMenu(false)}
        />
      ) : null}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 transition-transform duration-200 lg:hidden",
          mobileMenu ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Sidebar close={() => setMobileMenu(false)} />
      </div>

      <div className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <button
            onClick={() => setMobileMenu(true)}
            className="grid size-9 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="size-5" />
          </button>
          <div className="relative hidden w-full max-w-sm md:block">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-400" />
            <input
              aria-label="Buscar"
              placeholder="Buscar sedes, usuarios, vouchers…"
              className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none transition focus:border-brand-400 focus:bg-white focus:ring-4 focus:ring-brand-100"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 xl:flex">
              <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_#d1fae5]" />
              Todos los sistemas operativos
            </div>
            <button
              className="relative grid size-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              aria-label="Notificaciones"
            >
              <Bell className="size-4" />
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-rose-500 ring-2 ring-white" />
            </button>
            <button className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 sm:px-3">
              <CircleUserRound className="size-4 text-slate-400" />
              <span className="hidden sm:inline">Francisco</span>
              <ChevronDown className="size-3" />
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export function EnvironmentBadge() {
  return (
    <Badge variant="success" dot>
      Operativo
    </Badge>
  );
}
