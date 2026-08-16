import { Suspense } from "react";
import {
  Activity,
  CheckCircle2,
  Globe2,
  Headphones,
  LockKeyhole,
  RadioTower,
  ShieldCheck,
} from "lucide-react";

import { Brand } from "@wifi/ui";

import { LoginForm } from "@/components/login-form";

const trustItems = [
  { icon: ShieldCheck, text: "Aislamiento estricto entre clientes" },
  { icon: Activity, text: "Estado de red y sesiones en tiempo real" },
  { icon: Globe2, text: "Portales multidioma y RGPD por diseño" },
];

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh bg-white lg:grid-cols-[1.08fr_.92fr]">
      <section className="relative hidden min-h-dvh overflow-hidden bg-[#07172f] p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div className="grid-noise absolute inset-0 opacity-80" />
        <div className="absolute -right-32 -top-28 size-[36rem] rounded-full bg-brand-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 size-[32rem] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative">
          <Brand inverse />
        </div>
        <div className="relative max-w-xl">
          <div className="mb-7 flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/8">
              <RadioTower className="size-5 text-brand-300" />
            </span>
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
              Plataforma operativa
            </span>
          </div>
          <h1 className="text-balance text-4xl font-extrabold leading-[1.08] tracking-[-0.04em] xl:text-5xl">
            Tu red WiFi, segura y bajo control.
          </h1>
          <p className="mt-5 max-w-lg text-pretty text-base leading-7 text-slate-300 xl:text-lg">
            Gestiona sedes, portales cautivos, acceso de invitados y equipos MikroTik desde una
            única plataforma profesional.
          </p>
          <div className="mt-9 grid gap-4">
            {trustItems.map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-center gap-3 text-sm font-medium text-slate-200"
              >
                <CheckCircle2 className="size-4 text-cyan-300" />
                <Icon className="size-4 text-slate-500" />
                {text}
              </div>
            ))}
          </div>
        </div>
        <div className="relative flex items-center gap-3 text-xs text-slate-500">
          <Headphones className="size-4" /> Soporte ENTELSAT · Conectamos tecnología y confianza
        </div>
      </section>

      <section className="flex min-h-dvh items-center justify-center bg-slate-50 px-6 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-10 flex justify-center lg:hidden">
            <Brand />
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_24px_64px_rgba(15,23,42,0.08)] sm:p-9">
            <div className="mb-8">
              <div className="mb-5 grid size-11 place-items-center rounded-2xl bg-brand-50 text-brand-700">
                <LockKeyhole className="size-5" />
              </div>
              <h2 className="text-2xl font-extrabold tracking-[-0.03em] text-slate-950">
                Accede a tu cuenta
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Introduce tus credenciales para administrar tu servicio WiFi.
              </p>
            </div>
            <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-slate-50" />}>
              <LoginForm />
            </Suspense>
          </div>
          <p className="mt-6 text-center text-xs text-slate-400">
            © 2026 ENTELSAT · Privacidad · Condiciones del servicio
          </p>
        </div>
      </section>
    </main>
  );
}
