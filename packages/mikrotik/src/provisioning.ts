import { createHash } from "node:crypto";

import { z } from "zod";

const routerNameSchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[A-Za-z0-9_.-]+$/);
const cidrSchema = z.string().regex(/^(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/);

export const provisioningInputSchema = z.object({
  revision: z.number().int().positive(),
  mode: z.enum(["new-router", "integrate-existing", "hotspot-only"]),
  gatewayName: routerNameSchema,
  nasIdentifier: routerNameSchema,
  hotspotName: routerNameSchema,
  guestInterface: routerNameSchema,
  wanInterface: routerNameSchema.optional(),
  guestCidr: cidrSchema.optional(),
  poolRange: z
    .string()
    .max(64)
    .regex(/^[0-9.-]+$/)
    .optional(),
  dnsName: z
    .string()
    .min(4)
    .max(253)
    .regex(/^[a-z0-9.-]+$/),
  captiveOrigin: z
    .url()
    .refine((value) => value.startsWith("https://"), "Captive origin must use HTTPS"),
  radiusPrimary: z.union([z.ipv4(), z.ipv6()]),
  radiusSecondary: z.union([z.ipv4(), z.ipv6()]),
  radiusSecretVariable: z.literal("$ENTELSAT_RADIUS_SECRET"),
  interimIntervalSeconds: z.number().int().min(60).max(3600).default(300),
});

export type ProvisioningInput = z.infer<typeof provisioningInputSchema>;

export interface ProvisioningPlan {
  revision: number;
  fingerprint: string;
  status: "preview_only";
  blockers: readonly string[];
  preflight: readonly string[];
  backup: readonly string[];
  apply: readonly string[];
  verify: readonly string[];
  rollback: readonly string[];
}

function quote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function tagged(revision: number): string {
  return quote(`ENTELSAT managed revision=${revision}`);
}

export function buildProvisioningPlan(rawInput: unknown): ProvisioningPlan {
  const input = provisioningInputSchema.parse(rawInput);
  if (
    input.mode === "new-router" &&
    (!input.wanInterface || !input.guestCidr || !input.poolRange)
  ) {
    throw new TypeError("new-router mode requires WAN interface, guest CIDR and DHCP pool range");
  }

  const tag = tagged(input.revision);
  const backupBase = `entelsat-before-r${input.revision}`;
  const preflight = [
    "/system resource print without-paging",
    "/system package print without-paging",
    `/interface print detail where name=${quote(input.guestInterface)}`,
    `/ip hotspot print detail where name=${quote(input.hotspotName)}`,
    "/radius print detail without-paging",
    `/tool fetch url=${quote(`${input.captiveOrigin}/api/v1/health/live`)} output=none check-certificate=yes`,
  ];
  const backup = [
    `/system backup save name=${quote(backupBase)} dont-encrypt=no`,
    `/export terse file=${quote(`${backupBase}.rsc`)}`,
  ];
  const apply: string[] = [
    `:if ([:len ${input.radiusSecretVariable}] = 0) do={ :error "ENTELSAT RADIUS secret is missing" }`,
    `/radius add address=${input.radiusPrimary} service=hotspot secret=${input.radiusSecretVariable} timeout=1s comment=${tag}`,
    `/radius add address=${input.radiusSecondary} service=hotspot secret=${input.radiusSecretVariable} timeout=1s comment=${tag}`,
    `/ip hotspot profile set [find name=${quote(input.hotspotName)}] use-radius=yes radius-accounting=yes radius-interim-update=${input.interimIntervalSeconds}s dns-name=${quote(input.dnsName)} login-by=https,http-pap`,
    `/ip hotspot walled-garden add dst-host=${quote(new URL(input.captiveOrigin).hostname)} comment=${tag}`,
    `/system identity set name=${quote(input.gatewayName)}`,
  ];

  if (input.mode === "new-router") {
    apply.unshift(
      `/ip pool add name=${quote(`${input.hotspotName}-pool`)} ranges=${input.poolRange!} comment=${tag}`,
      `/ip address add address=${input.guestCidr!} interface=${quote(input.guestInterface)} comment=${tag}`,
    );
  }

  const verify = [
    `/ip hotspot profile print detail where name=${quote(input.hotspotName)}`,
    "/radius monitor numbers=all once",
    `/ping ${input.radiusPrimary} count=3 interval=300ms`,
    `/ping ${input.radiusSecondary} count=3 interval=300ms`,
  ];
  const rollback = [
    `# BLOCKED_BY_LAB_VALIDATION: restore is assisted, never automatically run on production`,
    `/system backup load name=${quote(`${backupBase}.backup`)}`,
  ];
  const serialized = JSON.stringify({ input, preflight, backup, apply, verify, rollback });
  return {
    revision: input.revision,
    fingerprint: createHash("sha256").update(serialized).digest("hex"),
    status: "preview_only",
    blockers: [
      "BLOCKED_BY_LAB_VALIDATION_ROUTEROS_PHYSICAL",
      "BLOCKED_BY_LAB_VALIDATION_PAP_CHAP",
      "BLOCKED_BY_LAB_VALIDATION_COA_PORT_SELECTOR",
    ],
    preflight,
    backup,
    apply,
    verify,
    rollback,
  };
}

export function renderReviewableScript(plan: ProvisioningPlan): string {
  const section = (title: string, commands: readonly string[]) =>
    [`# --- ${title} ---`, ...commands].join("\n");
  return [
    `# WiFi ENTELSAT provisioning revision ${plan.revision}`,
    `# SHA-256 ${plan.fingerprint}`,
    "# PREVIEW ONLY — requires approved diff and physical-lab validation",
    section("PREFLIGHT (read-only)", plan.preflight),
    section("BACKUP", plan.backup),
    section("APPLY", plan.apply),
    section("VERIFY", plan.verify),
    section("ROLLBACK (assisted)", plan.rollback),
  ].join("\n\n");
}

export function renderExternalLoginHtml(captiveOrigin: string, gatewayLocator: string): string {
  const origin = new URL(captiveOrigin);
  if (origin.protocol !== "https:") throw new TypeError("Captive portal must use HTTPS");
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(gatewayLocator))
    throw new TypeError("Invalid gateway locator");
  const action = `${origin.origin}/api/v1/captive/session/start`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>WiFi</title></head>
<body><form id="entelsat-captive" action="${action}" method="post">
<input type="hidden" name="gatewayLocator" value="${gatewayLocator}"><input type="hidden" name="mac" value="$(mac)"><input type="hidden" name="ip" value="$(ip)"><input type="hidden" name="linkLogin" value="$(link-login)"><input type="hidden" name="linkOrig" value="$(link-orig)"><input type="hidden" name="error" value="$(error)">
<noscript><button type="submit">Continue to WiFi</button></noscript></form><script>document.getElementById('entelsat-captive').submit()</script></body></html>`;
}
