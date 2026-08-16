import type { CaptiveLegalDocument } from "@wifi/contracts";
import Link from "next/link";

type TermsPageProps = {
  searchParams: Promise<{ state?: string; version?: string; locale?: string }>;
};

const demoDocument: CaptiveLegalDocument = {
  id: "0198be3c-70f4-7a10-9fc4-3f2f48a01001",
  siteName: "Hotel Miramar",
  title: "Condiciones de uso y privacidad (demostración)",
  kind: "terms",
  version: 1,
  locale: "es",
  content:
    "Texto exclusivamente demostrativo. La versión contractual debe ser revisada y publicada por el responsable antes de habilitar un tenant en producción.",
  contentHash: "0".repeat(64),
  publishedAt: new Date(0).toISOString(),
};

async function loadLegalDocument(
  state: string,
  version: string,
  locale: string,
): Promise<CaptiveLegalDocument | undefined> {
  const apiOrigin = process.env.INTERNAL_API_URL ?? "http://localhost:3001";
  const url = new URL("/api/v1/captive/legal", apiOrigin);
  url.searchParams.set("state", state);
  url.searchParams.set("version", version);
  url.searchParams.set("locale", locale);
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(3_000),
  }).catch(() => undefined);
  if (!response?.ok) return undefined;
  return (await response.json()) as CaptiveLegalDocument;
}

export default async function TermsPage({ searchParams }: TermsPageProps) {
  const { state = "", version = "", locale = "es" } = await searchParams;
  const document =
    process.env.NEXT_PUBLIC_DEMO_MODE === "true"
      ? { ...demoDocument, locale: locale === "en" ? "en" : "es" }
      : await loadLegalDocument(state, version, locale);
  const backUrl = state ? `/?state=${encodeURIComponent(state)}` : "/";

  return (
    <main className="min-h-dvh bg-slate-50 px-5 py-10 text-slate-700">
      <article className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <Link href={backUrl} className="text-xs font-bold text-hotel-700">
          ← Volver al acceso WiFi
        </Link>
        {document ? (
          <>
            <h1 className="mt-6 text-2xl font-extrabold text-slate-950">{document.title}</h1>
            <p className="mt-2 text-xs text-slate-400">
              {document.siteName} · v{document.version} · {document.locale.toUpperCase()}
            </p>
            <div className="mt-7 whitespace-pre-wrap text-sm leading-7">{document.content}</div>
            <p className="mt-8 break-all border-t border-slate-100 pt-4 font-mono text-[10px] text-slate-400">
              SHA-256: {document.contentHash}
            </p>
          </>
        ) : (
          <div role="alert" className="mt-8 rounded-xl bg-rose-50 p-5 text-sm text-rose-800">
            No se puede mostrar una versión legal publicada para esta sesión. Vuelve al acceso WiFi
            y solicita una sesión nueva.
          </div>
        )}
      </article>
    </main>
  );
}
