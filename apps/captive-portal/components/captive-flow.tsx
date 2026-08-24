"use client";

import {
  Check,
  ChevronDown,
  KeyRound,
  LoaderCircle,
  Lock,
  Mail,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import type {
  CaptiveAuthorizationResult,
  CaptiveLegalVersionRef,
  LoginMethod,
} from "@wifi/contracts";

type CaptiveContext = {
  siteName: string;
  legalVersionId: string;
  legalVersions: CaptiveLegalVersionRef[];
  availableMethods: LoginMethod[];
  languages: ("es" | "en")[];
  portal?: {
    name: string;
    headline: string;
    body: string;
    logoUrl?: string;
    redirectUrl?: string;
    primaryColor?: string;
  };
};

const demoContext: CaptiveContext = {
  siteName: "Hotel Miramar",
  legalVersionId: "0198be3c-70f4-7a10-9fc4-3f2f48a01001",
  legalVersions: [
    { id: "0198be3c-70f4-7a10-9fc4-3f2f48a01001", locale: "es" },
    { id: "0198be3c-70f4-7a10-9fc4-3f2f48a01002", locale: "en" },
  ],
  availableMethods: ["click", "email", "voucher"],
  languages: ["es", "en"],
  portal: {
    name: "Hotel Miramar",
    headline: "Bienvenido al WiFi",
    body: "Introduce tus datos para acceder a Internet.",
    primaryColor: "#f1ba1b",
  },
};

type PortalCopy = {
  description: string;
  click: string;
  email: string;
  firstNameLabel: string;
  lastNameLabel: string;
  voucher: string;
  pin: string;
  emailLabel: string;
  voucherLabel: string;
  pinLabel: string;
  terms: string;
  privacy: string;
  marketing: string;
  connect: string;
  secure: string;
};

const copy: Record<"es" | "en", PortalCopy> = {
  es: {
    description: "Conéctate al WiFi de huéspedes de forma segura.",
    click: "Acceso directo",
    email: "Correo",
    firstNameLabel: "Nombre",
    lastNameLabel: "Apellidos",
    voucher: "Voucher",
    pin: "PIN",
    emailLabel: "Tu correo electrónico",
    voucherLabel: "Código de acceso",
    pinLabel: "PIN de acceso",
    terms: "Acepto las condiciones de uso",
    privacy: "y he leído la política de privacidad.",
    marketing: "Quiero recibir ofertas del hotel. Opcional.",
    connect: "Conectarme a Internet",
    secure: "Conexión protegida · Servicio gestionado por WPass",
  },
  en: {
    description: "Connect securely to our guest WiFi.",
    click: "Quick access",
    email: "Email",
    firstNameLabel: "First name",
    lastNameLabel: "Last name",
    voucher: "Voucher",
    pin: "PIN",
    emailLabel: "Your email address",
    voucherLabel: "Access code",
    pinLabel: "Access PIN",
    terms: "I accept the terms of use",
    privacy: "and I have read the privacy policy.",
    marketing: "I would like to receive hotel offers. Optional.",
    connect: "Connect to the Internet",
    secure: "Protected connection · Service managed by WPass",
  },
};

export function CaptiveFlow() {
  const searchParams = useSearchParams();
  const [language, setLanguage] = useState<"es" | "en">("es");
  const [method, setMethod] = useState<LoginMethod>("click");
  const [context, setContext] = useState<CaptiveContext>();
  const [contextPending, setContextPending] = useState(true);
  const [contextError, setContextError] = useState<string>();
  const [legal, setLegal] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [authorization, setAuthorization] = useState<CaptiveAuthorizationResult>();
  const t = copy[language];
  const primaryColor = context?.portal?.primaryColor ?? "#0d9488";
  const redirectUrl = context?.portal?.redirectUrl ?? "https://www.entelsat.com/";
  const selectedLegalVersion =
    context?.legalVersions.find((version) => version.locale === language) ??
    context?.legalVersions[0];

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      setContext(demoContext);
      setContextPending(false);
      return;
    }

    const state = searchParams.get("state");
    if (!state) {
      setContextError("No se ha recibido una sesión de acceso válida.");
      setContextPending(false);
      return;
    }

    const controller = new AbortController();
    void fetch(`/api/v1/captive/context?state=${encodeURIComponent(state)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("CAPTIVE_CONTEXT_UNAVAILABLE");
        return (await response.json()) as CaptiveContext;
      })
      .then((nextContext) => {
        if (nextContext.availableMethods.length === 0 || nextContext.legalVersions.length === 0) {
          throw new Error("CAPTIVE_METHODS_UNAVAILABLE");
        }
        setContext(nextContext);
        setMethod(nextContext.availableMethods[0] ?? "click");
        if (!nextContext.languages.includes("es")) {
          setLanguage(nextContext.languages[0] ?? "es");
        }
        setContextPending(false);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setContextError("La sesión ha caducado o el servicio no está disponible.");
        setContextPending(false);
      });

    return () => controller.abort();
  }, [searchParams]);

  async function authorize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!legal) {
      setError(
        language === "es"
          ? "Debes aceptar las condiciones de uso para continuar."
          : "You must accept the terms of use to continue.",
      );
      return;
    }
    setPending(true);
    setError(undefined);
    const values = new FormData(event.currentTarget);
    const state = searchParams.get("state") ?? "demo-state-with-more-than-thirty-two-characters";

    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      setAuthorization({
        authorizationId: "0198be3c-70f4-7a10-9fc4-3f2f48a01002",
        username: "demo-authorization-user",
        password: "demo-ephemeral-password-0001",
        loginUrl: "https://hotspot.local/login",
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
      });
      setPending(false);
      return;
    }

    const payload = {
      state,
      method,
      ...(method === "email"
        ? {
            firstName: values.get("firstName"),
            lastName: values.get("lastName"),
            email: values.get("email"),
          }
        : {}),
      ...(method === "voucher"
        ? { voucher: String(values.get("voucher") ?? "").toUpperCase() }
        : {}),
      ...(method === "pin" ? { pin: String(values.get("pin") ?? "").toUpperCase() } : {}),
      acceptedLegalVersionId: selectedLegalVersion?.id,
      locale: language,
      marketingConsent: values.get("marketing") === "on",
    };
    const response = await fetch("/api/v1/captive/authorize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => undefined);
    if (!response?.ok) {
      setError(
        language === "es"
          ? "No hemos podido autorizar el acceso. Comprueba los datos o inténtalo de nuevo."
          : "We could not authorize access. Check your details and try again.",
      );
      setPending(false);
      return;
    }
    setAuthorization((await response.json()) as CaptiveAuthorizationResult);
    setPending(false);
  }

  if (contextPending) {
    return (
      <div className="grid min-h-80 place-items-center px-8 py-12 text-center" role="status">
        <span>
          <LoaderCircle className="mx-auto size-7 animate-spin text-hotel-600" />
          <span className="mt-4 block text-sm font-semibold text-slate-600">
            Preparando tu acceso seguro…
          </span>
        </span>
      </div>
    );
  }

  if (!context || contextError) {
    return (
      <div className="px-8 py-12 text-center" role="alert">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-rose-50 text-rose-600">
          <Lock className="size-6" />
        </span>
        <h1 className="mt-5 text-xl font-extrabold text-slate-900">Acceso no disponible</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-500">
          {contextError ?? "No hemos podido validar esta sesión."} Vuelve a seleccionar la red WiFi.
        </p>
      </div>
    );
  }

  if (authorization) {
    return (
      <div className="px-6 py-8 text-center sm:px-9">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/60">
          <Check className="size-7" strokeWidth={2.5} />
        </span>
        <h2 className="mt-6 text-2xl font-extrabold tracking-tight text-slate-900">
          {language === "es" ? "¡Todo listo!" : "You're all set!"}
        </h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-500">
          {language === "es"
            ? "Tu acceso se ha autorizado. Pulsa el botón para completar la conexión."
            : "Your access has been authorized. Tap the button to complete the connection."}
        </p>
        {process.env.NEXT_PUBLIC_DEMO_MODE === "true" ? (
          <button
            onClick={() => setAuthorization(undefined)}
            className="mt-7 h-12 w-full rounded-xl bg-hotel-600 px-5 text-sm font-bold text-white shadow-lg shadow-hotel-900/15 hover:bg-hotel-700"
          >
            {language === "es" ? "Ver demostración de nuevo" : "View demo again"}
          </button>
        ) : (
          <form action={authorization.loginUrl} method="post" className="mt-7">
            <input type="hidden" name="username" value={authorization.username} />
            <input type="hidden" name="password" value={authorization.password} />
            <input type="hidden" name="dst" value={redirectUrl} />
            <input type="hidden" name="popup" value="false" />
            <button
              type="submit"
              className="h-12 w-full rounded-xl bg-hotel-600 px-5 text-sm font-bold text-white shadow-lg shadow-hotel-900/15 hover:bg-hotel-700"
            >
              {language === "es" ? "Entrar en Internet" : "Go online"}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 sm:px-9">
        <div className="flex items-center gap-2">
          {context.portal?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={context.portal.logoUrl}
              alt={context.portal.name}
              className="size-8 rounded-xl object-contain"
            />
          ) : (
            <span className="grid size-8 place-items-center rounded-xl bg-slate-900 text-[9px] font-black tracking-tight text-white">
              {context.siteName
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase()}
            </span>
          )}
          <span>
            <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-800">
              {context.siteName}
            </span>
            <span className="block text-[9px] text-slate-400">Guest WiFi</span>
          </span>
        </div>
        {context.languages.length > 1 ? (
          <button
            onClick={() => setLanguage((value) => (value === "es" ? "en" : "es"))}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600"
          >
            <span>{language.toUpperCase()}</span>
            <ChevronDown className="size-3" />
          </button>
        ) : null}
      </div>
      <div className="px-6 pb-7 pt-6 sm:px-9 sm:pb-9">
        <div className="text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-hotel-50 text-hotel-700">
            <Wifi className="size-5" />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold tracking-[-0.035em] text-slate-950">
            {context.portal?.headline ??
              (language === "es"
                ? `Bienvenido a ${context.siteName}`
                : `Welcome to ${context.siteName}`)}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {context.portal?.body ?? t.description}
          </p>
        </div>
        <div
          className={`mt-6 grid rounded-xl bg-slate-100 p-1 ${
            context.availableMethods.length >= 4
              ? "grid-cols-4"
              : context.availableMethods.length === 3
                ? "grid-cols-3"
                : context.availableMethods.length === 2
                  ? "grid-cols-2"
                  : "grid-cols-1"
          }`}
          role="tablist"
          aria-label="Método de acceso"
        >
          {[
            { id: "click" as const, label: t.click, icon: Wifi },
            { id: "email" as const, label: t.email, icon: Mail },
            { id: "pin" as const, label: t.pin, icon: KeyRound },
            { id: "voucher" as const, label: t.voucher, icon: KeyRound },
          ]
            .filter(({ id }) => context.availableMethods.includes(id))
            .map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={method === id}
                onClick={() => {
                  setMethod(id);
                  setError(undefined);
                }}
                className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-bold transition sm:flex-row sm:text-xs ${method === id ? "bg-white text-hotel-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                style={method === id ? { color: primaryColor } : undefined}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
        </div>
        <form onSubmit={authorize} className="mt-5 grid gap-4">
          {method === "click" ? (
            <div className="rounded-xl border border-hotel-100 bg-hotel-50/60 px-4 py-3 text-xs leading-5 text-hotel-800">
              {language === "es"
                ? "Acceso inmediato tras aceptar las condiciones. No solicitaremos datos personales adicionales."
                : "Immediate access after accepting the terms. No additional personal information is requested."}
            </div>
          ) : null}
          {method === "email" ? (
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-bold text-slate-700">
                  {t.firstNameLabel}
                  <input
                    name="firstName"
                    type="text"
                    autoComplete="given-name"
                    required
                    minLength={1}
                    maxLength={80}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-hotel-500"
                    placeholder={language === "es" ? "Tu nombre" : "Your name"}
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-bold text-slate-700">
                  {t.lastNameLabel}
                  <input
                    name="lastName"
                    type="text"
                    autoComplete="family-name"
                    required
                    minLength={1}
                    maxLength={120}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-hotel-500"
                    placeholder={language === "es" ? "Tus apellidos" : "Your surname"}
                  />
                </label>
              </div>
              <label className="grid gap-1.5 text-xs font-bold text-slate-700">
                {t.emailLabel}
                <span className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-slate-400" />
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-sm font-normal outline-none focus:border-hotel-500"
                    placeholder="nombre@ejemplo.com"
                  />
                </span>
              </label>
            </div>
          ) : null}
          {method === "voucher" ? (
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              {t.voucherLabel}
              <span className="relative">
                <KeyRound className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-slate-400" />
                <input
                  name="voucher"
                  type="text"
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  minLength={6}
                  maxLength={64}
                  required
                  className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-3 font-mono text-sm uppercase tracking-wider outline-none focus:border-hotel-500"
                  placeholder="MIR-XXXX-XXXX"
                />
              </span>
            </label>
          ) : null}
          {method === "pin" ? (
            <label className="grid gap-1.5 text-xs font-bold text-slate-700">
              {t.pinLabel}
              <span className="relative">
                <KeyRound className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-slate-400" />
                <input
                  name="pin"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  minLength={4}
                  maxLength={32}
                  required
                  className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-3 font-mono text-sm uppercase tracking-wider outline-none focus:border-hotel-500"
                />
              </span>
            </label>
          ) : null}
          <div className="grid gap-3 rounded-xl border border-slate-200 p-3.5">
            <label className="flex cursor-pointer items-start gap-3 text-xs leading-5 text-slate-600">
              <input
                checked={legal}
                onChange={(event) => setLegal(event.target.checked)}
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-hotel-600"
              />
              <span>
                <strong className="font-semibold text-slate-800">{t.terms}</strong>{" "}
                <a
                  href={`/legal/terms?state=${encodeURIComponent(searchParams.get("state") ?? "")}&version=${encodeURIComponent(selectedLegalVersion?.id ?? context.legalVersionId)}&locale=${language}`}
                  target="_blank"
                  className="font-semibold text-hotel-700 underline underline-offset-2"
                >
                  {t.privacy}
                </a>
              </span>
            </label>
            {method === "email" ? (
              <label className="flex cursor-pointer items-start gap-3 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
                <input
                  name="marketing"
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-hotel-600"
                />
                <span>{t.marketing}</span>
              </label>
            ) : null}
          </div>
          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-rose-50 px-3.5 py-3 text-xs font-semibold leading-5 text-rose-700"
            >
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-hotel-600 px-5 text-sm font-bold text-white shadow-lg shadow-hotel-900/15 transition hover:bg-hotel-700 disabled:opacity-60"
            style={{ backgroundColor: primaryColor }}
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <>
                <Lock className="size-3.5" />
                {t.connect}
              </>
            )}
          </button>
        </form>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[10px] text-slate-400">
          <ShieldCheck className="size-3.5" />
          {t.secure}
        </p>
      </div>
    </>
  );
}
