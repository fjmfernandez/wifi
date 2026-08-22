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

const linkStoragePrefix = "entelsat.routerboard.link.";
const linkedFreshnessMs = 10 * 60 * 1000;

function routerQuote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function buildLoginHtml(locator: string): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>ENTELSAT WiFi</title>
</head>
<body>
  <form id="entelsat-captive" action="https://captive.wifi.entelsat.com/api/v1/captive/session/start" method="post">
    <input type="hidden" name="gatewayLocator" value="${locator}">
    <input type="hidden" name="mac" value="$(mac)">
    <input type="hidden" name="ip" value="$(ip)">
    <input type="hidden" name="linkLogin" value="$(link-login)">
    <input type="hidden" name="linkOrig" value="$(link-orig)">
    <input type="hidden" name="error" value="$(error)">
    <noscript><button type="submit">Continuar</button></noscript>
  </form>
  <script>document.getElementById("entelsat-captive").submit()</script>
</body>
</html>`;
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
  const sstpName = values.sstpName || "entelsat-sstp";
  const hotspotProfile = values.hotspotProfile || "default";
  const hotspotDnsName = material.hotspotDnsName;
  const radiusServerIp = values.radiusServerIp || "10.255.0.1";
  return [
    "# ENTELSAT WiFi · vinculación RouterBOARD por SSTP Client",
    "# Pegar en Terminal de MikroTik después de revisar interfaces y perfil HotSpot.",
    `# Gateway SaaS: ${gateway.name} · NAS-Identifier: ${gateway.nasIdentifier}`,
    "",
    ':log warning "ENTELSAT: creando SSTP client y RADIUS HotSpot"',
    `/interface sstp-client remove [find name=${routerQuote(sstpName)}]`,
    `/interface sstp-client add name=${routerQuote(sstpName)} connect-to=${routerQuote(
      values.sstpServer,
    )} port=${values.sstpPort || "4443"} user=${routerQuote(values.sstpUser)} password=${routerQuote(
      values.sstpPassword,
    )} authentication=mschap2 profile=default-encryption add-default-route=no verify-server-certificate=no disabled=no`,
    `/ip route remove [find comment=${routerQuote("ENTELSAT RADIUS via SSTP")}]`,
    `/ip route add dst-address=${radiusServerIp}/32 gateway=${routerQuote(
      sstpName,
    )} comment=${routerQuote("ENTELSAT RADIUS via SSTP")}`,
    `/system identity set name=${routerQuote(gateway.nasIdentifier)}`,
    `/radius remove [find comment=${routerQuote("ENTELSAT SaaS")}]`,
    `/radius add service=hotspot address=${radiusServerIp} secret=${routerQuote(
      material.radiusSecret,
    )} authentication-port=1812 accounting-port=1813 timeout=1500ms comment=${routerQuote(
      "ENTELSAT SaaS",
    )}`,
    `/ip hotspot profile set [find name=${routerQuote(
      hotspotProfile,
    )}] use-radius=yes radius-accounting=yes radius-interim-update=5m login-by=http-pap,https dns-name=${routerQuote(
      hotspotDnsName,
    )}`,
    `/ip hotspot walled-garden remove [find comment=${routerQuote("ENTELSAT captive")}]`,
    `/ip hotspot walled-garden add dst-host=${routerQuote(
      "captive.wifi.entelsat.com",
    )} comment=${routerQuote("ENTELSAT captive")}`,
    `/tool fetch url=${routerQuote(
      `https://captive.wifi.entelsat.com/api/v1/captive/gateway/ping?gatewayLocator=${material.gatewayLocator}`,
    )} mode=https output=user check-certificate=no`,
    ':log warning "ENTELSAT: sube el login.html generado a Files/hotspot/login.html"',
    "/radius print detail",
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
                placeholder="Servidor SSTP, ej. vpn.entelsat.com"
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
                defaultValue="entelsat-sstp"
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
                defaultValue="default"
                placeholder="Perfil HotSpot"
                className={inputClass}
              />
              <input
                name="hotspotDnsName"
                required
                defaultValue="login.entelsat.local"
                placeholder="DNS HotSpot local"
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
            <li>Sube el `login.html` generado a Files/hotspot/login.html.</li>
          </ol>
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
