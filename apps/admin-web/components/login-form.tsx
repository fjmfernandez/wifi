"use client";

import { ArrowRight, Eye, EyeOff, LoaderCircle, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button, Field, Input } from "@wifi/ui";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [requiresMfa, setRequiresMfa] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [help, setHelp] = useState<string>();
  const googleLoginEnabled = process.env.NEXT_PUBLIC_ADMIN_GOOGLE_LOGIN_ENABLED === "true";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    setHelp(undefined);

    const values = new FormData(event.currentTarget);
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
      const response = await fetch("/api/v1/auth/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: values.get("email"),
          password: values.get("password"),
          remember: values.get("remember") === "on",
          ...(requiresMfa ? { totp: values.get("totp") } : {}),
        }),
      }).catch(() => undefined);

      if (response?.status === 202) {
        setRequiresMfa(true);
        setHelp("Contraseña correcta. Introduce ahora el código de tu aplicación autenticadora.");
        setPending(false);
        return;
      }

      if (!response?.ok) {
        setError(
          response?.status === 429
            ? "Demasiados intentos. Espera unos minutos."
            : "No hemos podido verificar tus credenciales.",
        );
        setPending(false);
        return;
      }
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 450));
    }

    const returnTo = searchParams.get("returnTo");
    router.push(
      returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/administracion",
    );
    router.refresh();
  }

  function startGoogleLogin() {
    const returnTo = searchParams.get("returnTo");
    const url = new URL("/api/v1/auth/admin/oauth/google/start", window.location.origin);
    url.searchParams.set(
      "returnTo",
      returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/administracion",
    );
    window.location.assign(url.toString());
  }

  return (
    <div className="grid gap-5">
      {googleLoginEnabled ? (
        <>
          <button
            type="button"
            onClick={startGoogleLogin}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-5 text-sm font-extrabold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            <span className="grid size-6 place-items-center rounded-full bg-white text-base font-black text-[#4285f4] shadow-sm ring-1 ring-slate-200">
              G
            </span>
            Entrar con Google
          </button>
          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />
            o con contraseña
            <span className="h-px flex-1 bg-slate-200" />
          </div>
        </>
      ) : null}
      <form onSubmit={submit} method="post" className="grid gap-5">
        <Field label="Correo profesional">
          <Input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder="nombre@empresa.com"
            required
          />
        </Field>
        <Field label="Contraseña">
          <span className="relative block">
            <Input
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              minLength={12}
              className="pr-11"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </span>
        </Field>
        {requiresMfa ? (
          <Field label="Código de verificación">
            <Input
              name="totp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              autoFocus
              required
            />
            <span className="mt-1 block text-xs leading-5 text-slate-500">
              Introduce el código de seis cifras de tu aplicación autenticadora.
            </span>
          </Field>
        ) : null}
        <div className="flex items-center justify-between gap-4 text-sm">
          <label className="flex items-center gap-2 text-slate-600">
            <input
              type="checkbox"
              name="remember"
              className="size-4 rounded border-slate-300 accent-brand-600"
            />
            Recordar este equipo
          </label>
          <button
            type="button"
            onClick={() =>
              setHelp(
                "El reset automático aún no está activado. Pide a soporte que ejecute el reset de superadmin; te entregará una nueva URI/QR de autenticador.",
              )
            }
            className="font-semibold text-brand-700 hover:text-brand-800"
          >
            ¿Has olvidado la contraseña?
          </button>
        </div>
        {help ? (
          <p className="rounded-xl bg-brand-50 px-3.5 py-3 text-sm font-medium leading-6 text-brand-900">
            {help}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-700"
          >
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <>
              Entrar de forma segura <ArrowRight className="size-4" />
            </>
          )}
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck className="size-3.5" /> Sesión cifrada y protegida con verificación en dos
          pasos
        </p>
      </form>
    </div>
  );
}
