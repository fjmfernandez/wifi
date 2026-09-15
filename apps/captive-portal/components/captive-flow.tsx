"use client";

import {
  Check,
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
  Locale,
  LoginMethod,
} from "@wifi/contracts";

const supportedLocales = ["es", "en", "de", "fr", "ar"] as const satisfies readonly Locale[];
const localeLabels: Record<Locale, string> = {
  es: "Español",
  en: "English",
  de: "Deutsch",
  fr: "Français",
  ar: "العربية",
};

type CaptiveContext = {
  siteName: string;
  legalVersionId: string;
  legalVersions: CaptiveLegalVersionRef[];
  availableMethods: LoginMethod[];
  languages: Locale[];
  googleOAuthEnabled?: boolean;
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
  siteName: "Entelsat",
  legalVersionId: "0198be3c-70f4-7a10-9fc4-3f2f48a01001",
  legalVersions: [
    { id: "0198be3c-70f4-7a10-9fc4-3f2f48a01001", locale: "es" },
    { id: "0198be3c-70f4-7a10-9fc4-3f2f48a01002", locale: "en" },
    { id: "0198be3c-70f4-7a10-9fc4-3f2f48a01003", locale: "de" },
    { id: "0198be3c-70f4-7a10-9fc4-3f2f48a01006", locale: "fr" },
    { id: "0198be3c-70f4-7a10-9fc4-3f2f48a01007", locale: "ar" },
  ],
  availableMethods: ["email", "voucher"],
  languages: ["es", "en", "de", "fr", "ar"],
  portal: {
    name: "WPass",
    headline: "Bienvenido al WiFi de Entelsat",
    body: "Introduce tus datos para acceder a Internet.",
    redirectUrl: "https://www.entelsat.com/",
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
  google: string;
  googleHint: string;
  secure: string;
  loading: string;
  unavailableTitle: string;
  unavailableBody: string;
  termsRequired: string;
  googleTermsRequired: string;
  noLegal: string;
  invalidSession: string;
  authorizeError: string;
  readyTitle: string;
  readyBody: string;
  demoButton: string;
  retryButton: string;
  onlineButton: string;
  guestWifi: string;
  welcome: (siteName: string) => string;
  clickInfo: string;
  or: string;
  firstNamePlaceholder: string;
  lastNamePlaceholder: string;
  emailPlaceholder: string;
};

const copy: Record<Locale, PortalCopy> = {
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
    terms:
      "Acepto las condiciones de uso, la política de privacidad y que el establecimiento pueda enviarme ofertas y comunicaciones comerciales.",
    privacy: "Ver condiciones",
    marketing: "",
    connect: "Conectarme a Internet",
    google: "Continuar con Google",
    googleHint: "Usa tu cuenta de Google para confirmar tus datos y acceder al WiFi.",
    secure: "Conexión protegida · Servicio gestionado por WPass",
    loading: "Preparando tu acceso seguro…",
    unavailableTitle: "Acceso no disponible",
    unavailableBody:
      "No hemos podido validar esta sesión. Vuelve a seleccionar la red WiFi.",
    termsRequired: "Debes aceptar las condiciones de uso para continuar.",
    googleTermsRequired: "Debes aceptar las condiciones de uso para continuar con Google.",
    noLegal: "No hay versión legal disponible.",
    invalidSession: "No se ha recibido una sesión de acceso válida.",
    authorizeError:
      "No hemos podido autorizar el acceso. Comprueba los datos o inténtalo de nuevo.",
    readyTitle: "¡Todo listo!",
    readyBody: "Tu acceso se ha autorizado. Pulsa el botón para completar la conexión.",
    demoButton: "Simular Internet y redirigir",
    retryButton: "Probar otra vez",
    onlineButton: "Entrar en Internet",
    guestWifi: "WiFi invitados",
    welcome: (siteName) => `Bienvenido a ${siteName}`,
    clickInfo:
      "Acceso inmediato tras aceptar las condiciones. No solicitaremos datos personales adicionales.",
    or: "o",
    firstNamePlaceholder: "Tu nombre",
    lastNamePlaceholder: "Tus apellidos",
    emailPlaceholder: "nombre@ejemplo.com",
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
    terms:
      "I accept the terms of use, the privacy policy and that the venue may send me offers and commercial communications.",
    privacy: "View terms",
    marketing: "",
    connect: "Connect to the Internet",
    google: "Continue with Google",
    googleHint: "Use your Google account to confirm your details and access WiFi.",
    secure: "Protected connection · Service managed by WPass",
    loading: "Preparing your secure access…",
    unavailableTitle: "Access unavailable",
    unavailableBody: "We could not validate this session. Please select the WiFi network again.",
    termsRequired: "You must accept the terms of use to continue.",
    googleTermsRequired: "You must accept the terms of use to continue with Google.",
    noLegal: "No legal version found.",
    invalidSession: "No valid captive session was received.",
    authorizeError: "We could not authorize access. Check your details and try again.",
    readyTitle: "You're all set!",
    readyBody: "Your access has been authorized. Tap the button to complete the connection.",
    demoButton: "Simulate Internet access",
    retryButton: "Try again",
    onlineButton: "Go online",
    guestWifi: "Guest WiFi",
    welcome: (siteName) => `Welcome to ${siteName}`,
    clickInfo: "Immediate access after accepting the terms. No additional personal information is requested.",
    or: "or",
    firstNamePlaceholder: "Your name",
    lastNamePlaceholder: "Your surname",
    emailPlaceholder: "name@example.com",
  },
  de: {
    description: "Verbinden Sie sich sicher mit unserem Gäste-WLAN.",
    click: "Direktzugang",
    email: "E-Mail",
    firstNameLabel: "Vorname",
    lastNameLabel: "Nachname",
    voucher: "Voucher",
    pin: "PIN",
    emailLabel: "Ihre E-Mail-Adresse",
    voucherLabel: "Zugangscode",
    pinLabel: "Zugangs-PIN",
    terms:
      "Ich akzeptiere die Nutzungsbedingungen, die Datenschutzerklärung und dass der Betrieb mir Angebote und kommerzielle Mitteilungen senden darf.",
    privacy: "Bedingungen ansehen",
    marketing: "",
    connect: "Mit dem Internet verbinden",
    google: "Mit Google fortfahren",
    googleHint: "Nutzen Sie Ihr Google-Konto, um Ihre Daten zu bestätigen und WLAN-Zugang zu erhalten.",
    secure: "Geschützte Verbindung · Dienst verwaltet von WPass",
    loading: "Sicherer Zugang wird vorbereitet…",
    unavailableTitle: "Zugang nicht verfügbar",
    unavailableBody: "Wir konnten diese Sitzung nicht validieren. Bitte wählen Sie das WLAN erneut aus.",
    termsRequired: "Sie müssen die Nutzungsbedingungen akzeptieren, um fortzufahren.",
    googleTermsRequired: "Sie müssen die Nutzungsbedingungen akzeptieren, um mit Google fortzufahren.",
    noLegal: "Keine rechtliche Version verfügbar.",
    invalidSession: "Es wurde keine gültige Captive-Sitzung empfangen.",
    authorizeError: "Der Zugang konnte nicht autorisiert werden. Prüfen Sie Ihre Daten und versuchen Sie es erneut.",
    readyTitle: "Alles bereit!",
    readyBody: "Ihr Zugang wurde autorisiert. Tippen Sie auf die Schaltfläche, um die Verbindung abzuschließen.",
    demoButton: "Internetzugang simulieren",
    retryButton: "Erneut testen",
    onlineButton: "Ins Internet gehen",
    guestWifi: "Gäste-WLAN",
    welcome: (siteName) => `Willkommen bei ${siteName}`,
    clickInfo: "Sofortiger Zugang nach Annahme der Bedingungen. Es werden keine weiteren personenbezogenen Daten angefordert.",
    or: "oder",
    firstNamePlaceholder: "Ihr Vorname",
    lastNamePlaceholder: "Ihr Nachname",
    emailPlaceholder: "name@beispiel.de",
  },
  fr: {
    description: "Connectez-vous en toute sécurité au WiFi invité.",
    click: "Accès direct",
    email: "Email",
    firstNameLabel: "Prénom",
    lastNameLabel: "Nom",
    voucher: "Voucher",
    pin: "PIN",
    emailLabel: "Votre adresse email",
    voucherLabel: "Code d’accès",
    pinLabel: "PIN d’accès",
    terms:
      "J’accepte les conditions d’utilisation, la politique de confidentialité et que l’établissement puisse m’envoyer des offres et communications commerciales.",
    privacy: "Voir les conditions",
    marketing: "",
    connect: "Me connecter à Internet",
    google: "Continuer avec Google",
    googleHint: "Utilisez votre compte Google pour confirmer vos données et accéder au WiFi.",
    secure: "Connexion protégée · Service géré par WPass",
    loading: "Préparation de votre accès sécurisé…",
    unavailableTitle: "Accès indisponible",
    unavailableBody: "Nous n’avons pas pu valider cette session. Sélectionnez à nouveau le réseau WiFi.",
    termsRequired: "Vous devez accepter les conditions d’utilisation pour continuer.",
    googleTermsRequired: "Vous devez accepter les conditions d’utilisation pour continuer avec Google.",
    noLegal: "Aucune version légale disponible.",
    invalidSession: "Aucune session captive valide n’a été reçue.",
    authorizeError: "Nous n’avons pas pu autoriser l’accès. Vérifiez vos informations et réessayez.",
    readyTitle: "Tout est prêt !",
    readyBody: "Votre accès a été autorisé. Appuyez sur le bouton pour finaliser la connexion.",
    demoButton: "Simuler l’accès Internet",
    retryButton: "Réessayer",
    onlineButton: "Accéder à Internet",
    guestWifi: "WiFi invité",
    welcome: (siteName) => `Bienvenue chez ${siteName}`,
    clickInfo: "Accès immédiat après acceptation des conditions. Aucune donnée personnelle supplémentaire ne sera demandée.",
    or: "ou",
    firstNamePlaceholder: "Votre prénom",
    lastNamePlaceholder: "Votre nom",
    emailPlaceholder: "nom@exemple.fr",
  },
  ar: {
    description: "اتصل بشبكة WiFi الضيوف بأمان.",
    click: "دخول مباشر",
    email: "البريد الإلكتروني",
    firstNameLabel: "الاسم",
    lastNameLabel: "اسم العائلة",
    voucher: "قسيمة",
    pin: "رمز PIN",
    emailLabel: "بريدك الإلكتروني",
    voucherLabel: "رمز الدخول",
    pinLabel: "رمز PIN للدخول",
    terms:
      "أوافق على شروط الاستخدام وسياسة الخصوصية، وأوافق على أن ترسل لي المنشأة عروضًا ورسائل تجارية.",
    privacy: "عرض الشروط",
    marketing: "",
    connect: "الاتصال بالإنترنت",
    google: "المتابعة باستخدام Google",
    googleHint: "استخدم حساب Google لتأكيد بياناتك والوصول إلى شبكة WiFi.",
    secure: "اتصال محمي · خدمة مُدارة بواسطة WPass",
    loading: "جارٍ تجهيز الوصول الآمن…",
    unavailableTitle: "الوصول غير متاح",
    unavailableBody: "تعذر التحقق من هذه الجلسة. يرجى اختيار شبكة WiFi مرة أخرى.",
    termsRequired: "يجب قبول شروط الاستخدام للمتابعة.",
    googleTermsRequired: "يجب قبول شروط الاستخدام للمتابعة باستخدام Google.",
    noLegal: "لا توجد نسخة قانونية متاحة.",
    invalidSession: "لم يتم استلام جلسة صالحة.",
    authorizeError: "تعذر السماح بالدخول. تحقق من البيانات وحاول مرة أخرى.",
    readyTitle: "كل شيء جاهز!",
    readyBody: "تم السماح بالوصول. اضغط على الزر لإكمال الاتصال.",
    demoButton: "محاكاة الوصول إلى الإنترنت",
    retryButton: "المحاولة مرة أخرى",
    onlineButton: "الدخول إلى الإنترنت",
    guestWifi: "WiFi الضيوف",
    welcome: (siteName) => `مرحبًا بك في ${siteName}`,
    clickInfo: "دخول فوري بعد قبول الشروط. لن نطلب بيانات شخصية إضافية.",
    or: "أو",
    firstNamePlaceholder: "اسمك",
    lastNamePlaceholder: "اسم العائلة",
    emailPlaceholder: "name@example.com",
  },
};

export function CaptiveFlow({ forceDemo = false }: { forceDemo?: boolean }) {
  const searchParams = useSearchParams();
  const [language, setLanguage] = useState<Locale>("es");
  const [method, setMethod] = useState<LoginMethod>("email");
  const [context, setContext] = useState<CaptiveContext>();
  const [contextPending, setContextPending] = useState(true);
  const [contextError, setContextError] = useState<string>();
  const [legal, setLegal] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [authorization, setAuthorization] = useState<CaptiveAuthorizationResult>();
  const t = copy[language] ?? copy.es;
  const isRtl = language === "ar";
  const primaryColor = context?.portal?.primaryColor ?? "#0d9488";
  const redirectUrl = context?.portal?.redirectUrl ?? "https://www.entelsat.com/";
  const selectedLegalVersion =
    context?.legalVersions.find((version) => version.locale === language) ??
    context?.legalVersions[0];

  useEffect(() => {
    if (forceDemo || process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      setContext(demoContext);
      setMethod("email");
      setContextPending(false);
      return;
    }

    const state = searchParams.get("state");
    if (!state) {
      setContextError(copy.es.invalidSession);
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
        setMethod(nextContext.availableMethods[0] ?? "email");
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
  }, [forceDemo, searchParams]);

  async function authorize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!legal) {
      setError(t.termsRequired);
      return;
    }
    setPending(true);
    setError(undefined);
    const values = new FormData(event.currentTarget);
    const state = searchParams.get("state") ?? "demo-state-with-more-than-thirty-two-characters";

    if (forceDemo || process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      const email = String(values.get("email") ?? "");
      if (email) {
        const demoContact = {
          id: crypto.randomUUID(),
          firstName: String(values.get("firstName") ?? ""),
          lastName: String(values.get("lastName") ?? ""),
          email,
          marketingConsent: "granted",
          consentAt: new Date().toISOString(),
          visits: 1,
          organizationName: "Entelsat",
          lastSiteName: demoContext.siteName,
          lastSeenAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
        window.localStorage.setItem("wpass.clean.latestContact", JSON.stringify(demoContact));
        document.cookie = `wpass_demo_latest_contact=${encodeURIComponent(
          JSON.stringify(demoContact),
        )}; Max-Age=86400; Path=/; Domain=.wpass.es; Secure; SameSite=Lax`;
        document.cookie = `wpass_demo_latest_contact=${encodeURIComponent(
          JSON.stringify(demoContact),
        )}; Max-Age=86400; Path=/; SameSite=Lax`;
      }
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
      marketingConsent: method === "email",
    };
    const response = await fetch("/api/v1/captive/authorize", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => undefined);
    if (!response?.ok) {
      setError(t.authorizeError);
      setPending(false);
      return;
    }
    setAuthorization((await response.json()) as CaptiveAuthorizationResult);
    setPending(false);
  }

  function startGoogleOAuth() {
    if (!legal) {
      setError(t.googleTermsRequired);
      return;
    }
    if (!selectedLegalVersion) {
      setError(t.noLegal);
      return;
    }
    const state = searchParams.get("state");
    if (!state) {
      setError(t.invalidSession);
      return;
    }

    setError(undefined);
    const url = new URL("/api/v1/captive/oauth/google/start", window.location.origin);
    url.searchParams.set("state", state);
    url.searchParams.set("acceptedLegalVersionId", selectedLegalVersion.id);
    url.searchParams.set("locale", language);
    window.location.assign(url.toString());
  }

  if (contextPending) {
    return (
      <div className="grid min-h-80 place-items-center px-8 py-12 text-center" role="status">
        <span>
          <LoaderCircle className="mx-auto size-7 animate-spin text-hotel-600" />
          <span className="mt-4 block text-sm font-semibold text-slate-600">
            {t.loading}
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
        <h1 className="mt-5 text-xl font-extrabold text-slate-900">{t.unavailableTitle}</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-500">
          {contextError ?? t.unavailableBody}
        </p>
      </div>
    );
  }

  if (authorization) {
    return (
      <div className="px-6 py-8 text-center sm:px-9" dir={isRtl ? "rtl" : "ltr"}>
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/60">
          <Check className="size-7" strokeWidth={2.5} />
        </span>
        <h2 className="mt-6 text-2xl font-extrabold tracking-tight text-slate-900">
          {t.readyTitle}
        </h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-500">
          {t.readyBody}
        </p>
        {forceDemo || process.env.NEXT_PUBLIC_DEMO_MODE === "true" ? (
          <div className="mt-7 grid gap-3">
            <a
              href={redirectUrl}
              className="grid h-12 w-full place-items-center rounded-xl bg-hotel-600 px-5 text-sm font-bold text-white shadow-lg shadow-hotel-900/15 hover:bg-hotel-700"
            >
              {t.demoButton}
            </a>
            <button
              onClick={() => setAuthorization(undefined)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              {t.retryButton}
            </button>
          </div>
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
              {t.onlineButton}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <>
      <div
        className="flex items-center justify-between border-b border-slate-100 px-6 py-4 sm:px-9"
        dir={isRtl ? "rtl" : "ltr"}
      >
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
            <span className="block text-[9px] text-slate-400">{t.guestWifi}</span>
          </span>
        </div>
        {context.languages.length > 1 ? (
          <select
            aria-label="Idioma"
            value={language}
            onChange={(event) => setLanguage(event.target.value as Locale)}
            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 outline-none"
          >
            {supportedLocales
              .filter((locale) => context.languages.includes(locale))
              .map((locale) => (
                <option key={locale} value={locale}>
                  {localeLabels[locale]}
                </option>
              ))}
          </select>
        ) : null}
      </div>
      <div className="px-6 pb-7 pt-6 sm:px-9 sm:pb-9" dir={isRtl ? "rtl" : "ltr"}>
        <div className="text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-hotel-50 text-hotel-700">
            <Wifi className="size-5" />
          </span>
          <h1 className="mt-4 text-2xl font-extrabold tracking-[-0.035em] text-slate-950">
            {context.portal?.headline ??
              t.welcome(context.siteName)}
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
              {t.clickInfo}
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
                    placeholder={t.firstNamePlaceholder}
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
                    placeholder={t.lastNamePlaceholder}
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
                    placeholder={t.emailPlaceholder}
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
          </div>
          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-rose-50 px-3.5 py-3 text-xs font-semibold leading-5 text-rose-700"
            >
              {error}
            </p>
          ) : null}
          {context.googleOAuthEnabled ? (
            <>
              <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                {t.or}
                <span className="h-px flex-1 bg-slate-200" />
              </div>
              <button
                type="button"
                onClick={startGoogleOAuth}
                disabled={pending}
                className="flex h-12 items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-5 text-sm font-extrabold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
              >
                <span className="grid size-6 place-items-center rounded-full bg-white text-base font-black text-[#4285f4] shadow-sm ring-1 ring-slate-200">
                  G
                </span>
                {t.google}
              </button>
              <p className="-mt-1 text-center text-[11px] leading-5 text-slate-500">
                {t.googleHint}
              </p>
            </>
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
