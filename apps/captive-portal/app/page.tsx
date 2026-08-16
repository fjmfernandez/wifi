import { Suspense } from "react";
import { ShieldCheck, Wifi } from "lucide-react";

import { CaptiveFlow } from "@/components/captive-flow";

export default function CaptivePage() {
  return (
    <main className="portal-background relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-7 sm:px-6 sm:py-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.12) 1px,transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />
      <div className="relative w-full max-w-[430px]">
        <div className="mb-4 flex items-center justify-center gap-5 text-[10px] font-semibold text-white/70">
          <span className="flex items-center gap-1.5">
            <Wifi className="size-3.5" />
            WiFi para huéspedes
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" />
            Acceso seguro
          </span>
        </div>
        <section className="overflow-hidden rounded-[1.75rem] bg-white shadow-[0_30px_90px_rgba(2,18,36,.35)]">
          <Suspense fallback={<div className="h-[610px] animate-pulse bg-slate-50" />}>
            <CaptiveFlow />
          </Suspense>
        </section>
        <p className="mt-5 text-center text-[10px] text-white/45">
          El uso de esta red está sujeto a las condiciones del establecimiento.
        </p>
      </div>
    </main>
  );
}
