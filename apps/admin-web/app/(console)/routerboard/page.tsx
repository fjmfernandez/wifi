"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Link2,
  RefreshCcw,
  Router,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Button, Card } from "@wifi/ui";

import { PageHeader } from "@/components/page-header";
import { adminApi, inputClass } from "../admin-api";

interface GatewayView {
  id: string;
  siteName: string;
  siteCode: string;
  name: string;
  model: string | null;
  nasIdentifier: string;
  status: string;
  lastSeenAt: string | null;
}

interface LinkMaterial {
  gatewayId: string;
  gatewayName: string;
  siteName: string;
  nasIdentifier: string;
  tunnelClientIp: string;
  hotspotDnsName: string;
  gatewayLocator: string;
  radiusSecret: string;
  radiusClientLine: string;
  allowedLoginOrigins: string[];
}

interface SavedLinkMaterial {
  material: LinkMaterial;
  formValues: Record<string, string>;
  generatedAt: string;
}

const linkStoragePrefix = "wpass.routerboard.link.";
const linkedFreshnessMs = 10 * 60 * 1000;

function routerQuote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function routerFileQuote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("$", "\\$")}"`;
}

function normalizeRouterToken(value: string, fallback: string): string {
  const normalized = value.trim().replace(/[^A-Za-z0-9_.-]/g, "-");
  return normalized.length > 0 ? normalized : fallback;
}

function buildLoginHtml(locator: string): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>WPass WiFi</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a}
    .box{max-width:360px;margin:24px;padding:24px;border:1px solid #e2e8f0;border-radius:24px;background:white;box-shadow:0 24px 80px rgba(15,23,42,.10);text-align:center}
    .logo{display:inline-grid;place-items:center;width:48px;height:48px;border-radius:16px;background:#0f172a;color:white;font-weight:900;letter-spacing:-.08em}
    button{width:100%;height:48px;border:0;border-radius:14px;background:#0f766e;color:white;font-weight:800}
    p{color:#64748b;font-size:14px;line-height:1.55}
  </style>
</head>
<body>
  <main class="box">
    <span class="logo">WP</span>
    <h1>Conectando con WPass…</h1>
    <p>Estamos preparando el portal seguro para registrar el acceso WiFi.</p>
    <form id="wpass-captive" action="https://captive.wpass.es/api/v1/captive/session/start" method="post">
    <input type="hidden" name="gatewayLocator" value="${locator}">
    <input type="hidden" name="mac" value="$(mac)">
    <input type="hidden" name="macEsc" value="$(mac-esc)">
    <input type="hidden" name="ip" value="$(ip)">
    <input type="hidden" name="linkLogin" value="$(link-login)">
    <input type="hidden" name="linkOrig" value="$(link-orig)">
    <input type="hidden" name="error" value="$(error)">
    <input type="hidden" name="chapId" value="$(chap-id)">
    <input type="hidden" name="chapChallenge" value="$(chap-challenge)">
    <input type="hidden" name="linkLoginOnly" value="$(link-login-only)">
    <input type="hidden" name="linkOrigEsc" value="$(link-orig-esc)">
    <button type="submit">Abrir portal WiFi</button>
    </form>
  </main>
  <script>
    window.setTimeout(function(){document.getElementById("wpass-captive").submit()}, 250);
  </script>
</body>
</html>`;
}

function buildApiJson(): string {
  return `{
  "provider": "wpass",
  "captive": $(if logged-in == 'yes')false$(else)true$(endif),
  "user-portal-url": "$(link-login-only)",
$(if session-timeout-secs != 0)
  "seconds-remaining": $(session-timeout-secs),
$(endif)
$(if remain-bytes-total)
  "bytes-remaining": $(remain-bytes-total),
$(endif)
  "can-extend-session": true
}`;
}

function buildRouterScript({
  gateway,
  material,
  values,
}: {
  gateway: GatewayView;
  material: LinkMaterial;
  values: Record<string, string>;
}): string {
  const sstpName = normalizeRouterToken(values.sstpName || "sstp-wpass", "sstp-wpass");
  const hotspotProfile = normalizeRouterToken(values.hotspotProfile || "wpass", "wpass");
  const hotspotName = normalizeRouterToken(values.hotspotName || "wpass-hotspot", "wpass-hotspot");
  const hotspotInterface = values.hotspotInterface || "wifi";
  const hotspotAddress = values.hotspotAddress || "192.168.50.1";
  const htmlDirectory = normalizeRouterToken(values.htmlDirectory || "hotspot", "hotspot");
  const hotspotDnsName = material.hotspotDnsName;
  const radiusServerIp = values.radiusServerIp || "10.255.0.1";
  const captiveHost = "captive.wpass.es";
  const captiveIp = values.captiveIp || "62.84.190.174";
  const loginHtml = buildLoginHtml(material.gatewayLocator).replace(/\s+/g, " ").trim();
  const apiJson = buildApiJson().replace(/\s+/g, " ").trim();
  return [
    "# WPass WiFi · alta rapida RouterBOARD por SSTP Client + HotSpot + RADIUS",
    "# Pegar en Terminal de MikroTik tras revisar la interfaz de clientes y la IP del HotSpot.",
    `# Gateway SaaS: ${gateway.name} · NAS-Identifier: ${gateway.nasIdentifier}`,
    "# El script es idempotente: elimina/recrea solo objetos marcados como WPass.",
    "",
    ':log warning "WPass: creando SSTP client y RADIUS HotSpot"',
    `/interface sstp-client remove [find name=${routerQuote(sstpName)}]`,
    `/interface sstp-client add name=${routerQuote(sstpName)} connect-to=${routerQuote(
      values.sstpServer,
    )} port=${values.sstpPort || "4443"} user=${routerQuote(values.sstpUser)} password=${routerQuote(
      values.sstpPassword,
    )} authentication=mschap2 profile=default-encryption add-default-route=no verify-server-certificate=no disabled=no`,
    `/ip dns set allow-remote-requests=yes`,
    `/ip dns static remove [find comment=${routerQuote("WPass captive")}]`,
    `/ip dns static add name=${routerQuote(captiveHost)} address=${captiveIp} ttl=1h comment=${routerQuote(
      "WPass captive",
    )}`,
    `/ip route remove [find comment=${routerQuote("WPass RADIUS via SSTP")}]`,
    `/ip route add dst-address=${radiusServerIp}/32 gateway=${routerQuote(
      sstpName,
    )} comment=${routerQuote("WPass RADIUS via SSTP")}`,
    `/system identity set name=${routerQuote(gateway.nasIdentifier)}`,
    `/radius remove [find comment=${routerQuote("WPass SaaS")}]`,
    `/radius add service=hotspot address=${radiusServerIp} secret=${routerQuote(
      material.radiusSecret,
    )} authentication-port=1812 accounting-port=1813 timeout=1500ms comment=${routerQuote(
      "WPass SaaS",
    )}`,
    `/radius incoming set accept=yes port=1700`,
    `:if ([:len [/ip hotspot profile find name=${routerQuote(hotspotProfile)}]] = 0) do={ /ip hotspot profile add name=${routerQuote(
      hotspotProfile,
    )} hotspot-address=${hotspotAddress} dns-name=${routerQuote(
      hotspotDnsName,
    )} html-directory=${routerQuote(
      htmlDirectory,
    )} use-radius=yes radius-accounting=yes radius-interim-update=5m login-by=http-pap,mac-cookie }`,
    `/ip hotspot profile set [find name=${routerQuote(hotspotProfile)}] hotspot-address=${hotspotAddress} dns-name=${routerQuote(
      hotspotDnsName,
    )} html-directory=${routerQuote(
      htmlDirectory,
    )} use-radius=yes radius-accounting=yes radius-interim-update=5m login-by=http-pap,mac-cookie`,
    `:if ([:len [/ip hotspot find name=${routerQuote(hotspotName)}]] = 0) do={ /ip hotspot add name=${routerQuote(
      hotspotName,
    )} interface=${routerQuote(hotspotInterface)} profile=${routerQuote(
      hotspotProfile,
    )} disabled=no } else={ /ip hotspot set [find name=${routerQuote(hotspotName)}] interface=${routerQuote(
      hotspotInterface,
    )} profile=${routerQuote(hotspotProfile)} disabled=no }`,
    `/ip hotspot walled-garden remove [find comment=${routerQuote("WPass captive")}]`,
    `/ip hotspot walled-garden add dst-host=${routerQuote(captiveHost)} comment=${routerQuote(
      "WPass captive",
    )}`,
    `/ip hotspot walled-garden add dst-host=${routerQuote("wpass.es")} comment=${routerQuote(
      "WPass captive",
    )}`,
    `:do { /file make-directory ${routerQuote(htmlDirectory)} } on-error={}`,
    `/file remove [find name=${routerQuote(`${htmlDirectory}/login.html`)}]`,
    `/file add name=${routerQuote(`${htmlDirectory}/login.html`)} contents=${routerFileQuote(
      loginHtml,
    )}`,
    `/file remove [find name=${routerQuote(`${htmlDirectory}/api.json`)}]`,
    `/file add name=${routerQuote(`${htmlDirectory}/api.json`)} contents=${routerFileQuote(
      apiJson,
    )}`,
    `/tool fetch url=${routerQuote(
      `https://captive.wpass.es/api/v1/captive/gateway/ping?gatewayLocator=${material.gatewayLocator}`,
    )} mode=https output=user check-certificate=no`,
    ':log warning "WPass: alta terminada. Si el fetch anterior finalizo, pulsa Comprobar vinculacion en WPass."',
    "/radius print detail",
    `/ip hotspot profile print detail where name=${routerQuote(hotspotProfile)}`,
    `/ping ${radiusServerIp} count=3`,
  ].join("\n");
}

function isGatewayLinked(gateway: GatewayView | null): boolean {
  if (!gateway) return false;
  if (gateway.status === "online") return true;
  if (!gateway.lastSeenAt) return false;
  return Date.now() - new Date(gateway.lastSeenAt).getTime() <= linkedFreshnessMs;
}

function linkStatusLabel(gateway: GatewayView | null): string {
  if (!gateway) return "Sin gateway seleccionado";
  if (isGatewayLinked(gateway)) return "Vinculado";
  if (gateway.lastSeenAt)
    return `No vinculado ahora · última señal ${formatDateTime(gateway.lastSeenAt)}`;
  return "No vinculado";
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function storageKey(gatewayId: string): string {
  return `${linkStoragePrefix}${gatewayId}`;
}

export default function RouterBoardLinkPage() {
  const [gateways, setGateways] = useState<GatewayView[]>([]);
  const [selectedGatewayId, setSelectedGatewayId] = useState("");
  const [material, setMaterial] = useState<LinkMaterial | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setError(null);
    const nextGateways = await adminApi<GatewayView[]>("/api/v1/admin/gateways");
    setGateways(nextGateways);
    setSelectedGatewayId((current) => current || nextGateways[0]?.id || "");
  }

  useEffect(() => {
    void refresh().catch((cause) =>
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar gateways"),
    );
  }, []);

  const selectedGateway = useMemo(
    () => gateways.find((gateway) => gateway.id === selectedGatewayId) ?? null,
    [gateways, selectedGatewayId],
  );
  const selectedLinked = isGatewayLinked(selectedGateway);

  useEffect(() => {
    if (!selectedGatewayId) {
      setMaterial(null);
      setFormValues({});
      return;
    }
    const saved = window.localStorage.getItem(storageKey(selectedGatewayId));
    if (!saved) {
      setMaterial(null);
      setFormValues({});
      return;
    }
    try {
      const parsed = JSON.parse(saved) as SavedLinkMaterial;
      setMaterial(parsed.material);
      setFormValues(parsed.formValues);
    } catch {
      window.localStorage.removeItem(storageKey(selectedGatewayId));
      setMaterial(null);
      setFormValues({});
    }
  }, [selectedGatewayId]);

  const routerScript =
    selectedGateway && material
      ? buildRouterScript({ gateway: selectedGateway, material, values: formValues })
      : "";
  const loginHtml = material ? buildLoginHtml(material.gatewayLocator) : "";
  const apiJson = material ? buildApiJson() : "";
  const sstpUsersLine =
    material && formValues.sstpUser && formValues.sstpPassword
      ? `${formValues.sstpUser}\t${formValues.sstpPassword}\t${material.tunnelClientIp}`
      : "";

  async function generate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedGateway) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const data = new FormData(event.currentTarget);
    const values = Object.fromEntries(
      Array.from(data.entries()).map(([key, value]) => [key, String(value)]),
    );
    try {
      const nextMaterial = await adminApi<LinkMaterial>(
        `/api/v1/admin/gateways/${selectedGateway.id}/link-material`,
        {
          method: "POST",
          body: JSON.stringify({
            tunnelClientIp: values.tunnelClientIp,
            hotspotDnsName: values.hotspotDnsName,
          }),
        },
      );
      setFormValues(values);
      setMaterial(nextMaterial);
      window.localStorage.setItem(
        storageKey(selectedGateway.id),
        JSON.stringify({
          material: nextMaterial,
          formValues: values,
          generatedAt: new Date().toISOString(),
        } satisfies SavedLinkMaterial),
      );
      setMessage("Vinculación creada. Copia las variables de Coolify y pega el script en el RB.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo generar la vinculación");
    } finally {
      setSaving(false);
    }
  }

  async function copy(text: string, label: string): Promise<void> {
    await navigator.clipboard.writeText(text);
    setMessage(`${label} copiado`);
  }

  async function checkLink(): Promise<void> {
    await refresh();
    setMessage(
      "Estado actualizado. Si el script ya se ejecutó en el RB, debería aparecer en verde.",
    );
  }

  return (
    <>
      <PageHeader
        title="Vincular RouterBOARD"
        description="Genera el material para conectar un MikroTik por SSTP Client y usar FreeRADIUS/portal cautivo."
        actions={
          <Button variant="secondary" onClick={() => void checkLink()}>
            <RefreshCcw className="size-4" /> Comprobar vinculación
          </Button>
        }
      />

      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {message}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <form
          onSubmit={(event) => void generate(event)}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
            <Router className="size-4 text-brand-700" /> Datos de vinculación
          </h2>
          <div
            className={`mt-3 flex items-start gap-3 rounded-2xl border px-4 py-3 ${
              selectedLinked
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {selectedLinked ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            ) : (
              <XCircle className="mt-0.5 size-5 shrink-0" />
            )}
            <div>
              <p className="text-sm font-extrabold">{linkStatusLabel(selectedGateway)}</p>
              <p className="mt-1 text-xs font-semibold opacity-80">
                El estado pasa a verde cuando el RB ejecuta el script y llama al SaaS, o cuando el
                portal cautivo recibe tráfico de ese gateway.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-xs font-bold text-slate-600">
              Gateway SaaS
              <select
                name="gatewayId"
                required
                value={selectedGatewayId}
                onChange={(event) => setSelectedGatewayId(event.target.value)}
                className={inputClass}
              >
                {gateways.map((gateway) => (
                  <option key={gateway.id} value={gateway.id}>
                    {isGatewayLinked(gateway) ? "🟢" : "🔴"} {gateway.name} ·{" "}
                    {gateway.nasIdentifier} · {gateway.siteName}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                name="sstpServer"
                required
                defaultValue="62.84.190.174"
                placeholder="Servidor SSTP, ej. wpass.es"
                className={inputClass}
              />
              <input
                name="sstpPort"
                required
                defaultValue="4443"
                placeholder="Puerto SSTP"
                className={inputClass}
              />
              <input
                name="sstpName"
                defaultValue="sstp-wpass"
                placeholder="Nombre interfaz SSTP"
                className={inputClass}
              />
              <input name="sstpUser" required placeholder="Usuario SSTP" className={inputClass} />
              <input
                name="sstpPassword"
                required
                type="password"
                placeholder="Clave SSTP"
                className={inputClass}
              />
              <input
                name="tunnelClientIp"
                required
                defaultValue="10.255.0.2"
                placeholder="IP del RB en SSTP"
                className={inputClass}
              />
              <input
                name="radiusServerIp"
                required
                defaultValue="10.255.0.1"
                placeholder="IP RADIUS por SSTP"
                className={inputClass}
              />
              <input
                name="hotspotProfile"
                required
                defaultValue="wpass"
                placeholder="Perfil HotSpot"
                className={inputClass}
              />
              <input
                name="hotspotName"
                required
                defaultValue="wpass-hotspot"
                placeholder="Servidor HotSpot"
                className={inputClass}
              />
              <input
                name="hotspotInterface"
                required
                defaultValue="wifi"
                placeholder="Interfaz clientes, ej. wifi/bridge"
                className={inputClass}
              />
              <input
                name="hotspotAddress"
                required
                defaultValue="192.168.50.1"
                placeholder="IP HotSpot"
                className={inputClass}
              />
              <input
                name="hotspotDnsName"
                required
                defaultValue="login.wpass.local"
                placeholder="DNS HotSpot local"
                className={inputClass}
              />
              <input
                name="htmlDirectory"
                required
                defaultValue="hotspot"
                placeholder="Carpeta HTML"
                className={inputClass}
              />
              <input
                name="captiveIp"
                required
                defaultValue="62.84.190.174"
                placeholder="IP pública WPass"
                className={inputClass}
              />
            </div>
          </div>
          <Button type="submit" className="mt-4" disabled={saving || !selectedGateway}>
            <KeyRound className="size-4" /> {saving ? "Generando…" : "Generar vinculación"}
          </Button>
        </form>

        <Card className="p-4">
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
            <ShieldCheck className="size-4 text-emerald-700" /> Orden de aplicación
          </h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-5 text-slate-600">
            <li>Genera el material en esta pantalla.</li>
            <li>Copia `SSTP_USERS_TSV` y `RADIUS_CLIENTS_TSV` en Coolify.</li>
            <li>Redepliega para que SSTP y RADIUS carguen esos secretos.</li>
            <li>Pega el script generado en Terminal de MikroTik.</li>
            <li>
              Pulsa “Comprobar vinculación”. Si el RB llegó al SaaS, verás el estado en verde.
            </li>
            <li>
              El script ya crea `Files/hotspot/login.html` y `Files/hotspot/api.json`. Si tu
              RouterOS no permite escribir ficheros por script, copia esos bloques manualmente.
            </li>
          </ol>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            <p className="font-extrabold text-slate-800">Equivalencia con el ejemplo Hotelinking</p>
            <p className="mt-1">
              SSTP client → `sstp-wpass`; perfil HotSpot → `wpass`; DNS local → `login.wpass.local`;
              carpeta HTML → `hotspot`; portal cloud → `captive.wpass.es`.
            </p>
          </div>
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-800">
            El secreto RADIUS solo aparece al generar. Guárdalo en Coolify; no se guarda visible en
            la base de datos.
          </p>
        </Card>
      </div>

      {material ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <Card
            className={`p-4 xl:col-span-2 ${
              selectedLinked ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"
            }`}
          >
            <h2
              className={`flex items-center gap-2 text-sm font-extrabold ${
                selectedLinked ? "text-emerald-900" : "text-rose-900"
              }`}
            >
              {selectedLinked ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <XCircle className="size-4" />
              )}
              Estado de esta vinculación: {linkStatusLabel(selectedGateway)}
            </h2>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-700">
              El script incluye una verificación automática contra el SaaS. Después de pegarlo en
              MikroTik, espera unos segundos y pulsa “Comprobar vinculación”.
            </p>
          </Card>
          <OutputBlock
            title="Variable Coolify SSTP_USERS_TSV"
            value={sstpUsersLine}
            onCopy={() => void copy(sstpUsersLine, "SSTP_USERS_TSV")}
          />
          <OutputBlock
            title="Variable Coolify RADIUS_CLIENTS_TSV"
            value={material.radiusClientLine}
            onCopy={() => void copy(material.radiusClientLine, "RADIUS_CLIENTS_TSV")}
          />
          <OutputBlock
            title="Script RouterOS"
            value={routerScript}
            onCopy={() => void copy(routerScript, "Script RouterOS")}
          />
          <OutputBlock
            title="login.html MikroTik"
            value={loginHtml}
            onCopy={() => void copy(loginHtml, "login.html")}
          />
          <OutputBlock
            title="api.json MikroTik"
            value={apiJson}
            onCopy={() => void copy(apiJson, "api.json")}
          />
          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
              <Link2 className="size-4 text-brand-700" /> Material creado
            </h2>
            <dl className="mt-3 grid gap-2 text-xs">
              <div>
                <dt className="font-bold text-slate-500">NAS Identifier</dt>
                <dd className="font-mono text-slate-800">{material.nasIdentifier}</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">Gateway locator</dt>
                <dd className="break-all font-mono text-slate-800">{material.gatewayLocator}</dd>
              </div>
              <div>
                <dt className="font-bold text-slate-500">Orígenes HotSpot permitidos</dt>
                <dd className="font-mono text-slate-800">
                  {material.allowedLoginOrigins.join(", ")}
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      ) : null}
    </>
  );
}

function OutputBlock({
  title,
  value,
  onCopy,
}: {
  title: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-extrabold text-slate-900">{title}</h2>
        <Button variant="secondary" size="sm" onClick={onCopy}>
          <Copy className="size-3.5" /> Copiar
        </Button>
      </div>
      <pre className="max-h-[420px] overflow-auto bg-slate-950 p-4 text-xs leading-5 text-slate-100">
        {value}
      </pre>
    </Card>
  );
}
