type JsonRecord = Record<string, unknown>;

const now = () => new Date().toISOString();

const ids = {
  organization: "demo-org-wpass",
  site: "demo-site-gatewaycasa",
  gateway: "demo-gateway-casa",
  policy: "demo-policy-free",
  policyVersion: "demo-policy-free-v1",
  portal: "demo-portal-wpass",
  portalVersion: "demo-portal-wpass-v1",
};

function stored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function cookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const row = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return row ? decodeURIComponent(row.slice(prefix.length)) : null;
}

function latestDemoContact(): JsonRecord | null {
  const cookieContact = cookieValue("wpass_demo_latest_contact");
  const raw =
    cookieContact ??
    (typeof window !== "undefined" ? window.localStorage.getItem("wpass.clean.latestContact") : null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as JsonRecord;
  } catch {
    return null;
  }
}

function save<T>(key: string, value: T): T {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, JSON.stringify(value));
  }
  return value;
}

function body(init?: RequestInit): JsonRecord {
  if (!init?.body || typeof init.body !== "string") return {};
  try {
    return JSON.parse(init.body) as JsonRecord;
  } catch {
    return {};
  }
}

function text(value: unknown, fallback = ""): string {
  const next = String(value ?? "").trim();
  return next || fallback;
}

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function organizations() {
  return stored("wpass.clean.organizations", [
    {
      id: ids.organization,
      code: "ENTELSAT",
      name: "Entelsat",
      legalName: "Entelsat",
      accessEmail: "entelsat@entelsat.com",
      status: "active",
      marketingAccessEnabled: true,
      sitesTotal: 1,
      createdAt: now(),
    },
  ]);
}

function sites() {
  return stored("wpass.clean.sites", [
    {
      id: ids.site,
      organizationId: ids.organization,
      code: "CASA",
      name: "Entelsat",
      status: "active",
      timezone: "Europe/Madrid",
      countryCode: "ES",
      gatewaysTotal: 1,
      gatewaysOnline: 1,
      createdAt: now(),
    },
  ]);
}

function gateways() {
  return stored("wpass.clean.gateways", [
    {
      id: ids.gateway,
      siteId: ids.site,
      siteName: "Entelsat",
      siteCode: "CASA",
      name: "gateway casa",
      model: "MikroTik RouterBOARD",
      serial: "DEMO-0001",
      nasIdentifier: "gatewaycasa",
      status: "online",
      routerOsVersion: "7.x",
      lastSeenAt: now(),
      createdAt: now(),
    },
  ]);
}

function policies() {
  return stored("wpass.clean.policies", [
    {
      id: ids.policy,
      name: "WiFi invitados · 20 Mbps · 24h",
      status: "active",
      versionId: ids.policyVersion,
      version: 1,
      versionStatus: "published",
      downloadKbps: 20_000,
      uploadKbps: 5_000,
      sessionTimeoutSeconds: 86_400,
      quotaBytes: null,
      maxConcurrentDevices: 1,
      createdAt: now(),
    },
  ]);
}

function portals() {
  return stored("wpass.clean.portals", [
    {
      id: ids.portal,
      name: "Portal Entelsat",
      kind: "wifi",
      versionId: ids.portalVersion,
      version: 1,
      status: "published",
      fallbackLocale: "es",
      headline: "Bienvenido al WiFi de Entelsat",
      body: "Regístrate con nombre, apellidos y email para acceder a Internet.",
      logoUrl: null,
      redirectUrl: "https://www.entelsat.com/",
      primaryColor: "#0d9488",
      siteNames: ["Entelsat"],
      publications: [
        {
          id: "demo-publication-gatewaycasa",
          siteId: ids.site,
          siteName: "Entelsat",
          startsAt: now(),
          endsAt: null,
          active: true,
        },
      ],
      createdAt: now(),
    },
  ]);
}

function marketingContacts() {
  const latest = latestDemoContact();
  return latest ? [latest] : [];
}

function voucherBatches() {
  return stored("wpass.clean.voucherBatches", [
    {
      id: "demo-voucher-batch",
      name: "Recepción",
      siteName: "Entelsat",
      siteCode: "CASA",
      policyName: "WiFi invitados · 20 Mbps · 24h",
      policyLimits: "20 Mbps bajada · 5 Mbps subida · 24 h · sin cuota de MB",
      quantity: 1,
      available: 1,
      used: 0,
      defaultMaxUses: 1,
      defaultMaxDevices: 1,
      reprintable: true,
      expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      createdAt: now(),
      oneTimeCodes: ["WPASS-DEMO-2026"],
    },
  ]);
}

function updateCollection<T extends JsonRecord>(
  key: string,
  fallback: T[],
  itemId: string,
  patch: JsonRecord,
): T {
  const next = fallback.map((item) => (item.id === itemId ? { ...item, ...patch } : item));
  save(key, next);
  return (next.find((item) => item.id === itemId) ?? next[0]) as T;
}

function deleteFromCollection<T extends JsonRecord>(key: string, fallback: T[], itemId: string): void {
  save(
    key,
    fallback.filter((item) => item.id !== itemId),
  );
}

export async function demoAdminApi<T>(path: string, init?: RequestInit): Promise<T> {
  await new Promise((resolve) => window.setTimeout(resolve, 180));
  const method = init?.method?.toUpperCase() ?? "GET";
  const payload = body(init);

  if (path === "/api/v1/admin/organizations") {
    if (method === "POST") {
      const next = [
        {
          id: id("demo-org"),
          code: text(payload.code, "CLIENTE").toUpperCase(),
          name: text(payload.name, "Cliente nuevo"),
          legalName: text(payload.legalName) || null,
          accessEmail: text(payload.accessEmail) || null,
          status: "active",
          marketingAccessEnabled: Boolean(payload.marketingAccessEnabled),
          sitesTotal: 0,
          createdAt: now(),
        },
        ...organizations(),
      ];
      save("wpass.clean.organizations", next);
      return next[0] as T;
    }
    return organizations() as T;
  }

  if (/\/api\/v1\/admin\/organizations\/[^/]+$/.test(path)) {
    const itemId = path.split("/")[5] ?? "";
    if (method === "DELETE") {
      deleteFromCollection("wpass.clean.organizations", organizations(), itemId);
      return { archived: true } as T;
    }
    return updateCollection("wpass.clean.organizations", organizations(), itemId, {
      code: text(payload.code).toUpperCase(),
      name: text(payload.name),
      legalName: text(payload.legalName) || null,
      accessEmail: text(payload.accessEmail) || null,
      marketingAccessEnabled: Boolean(payload.marketingAccessEnabled),
    }) as T;
  }

  if (path === "/api/v1/admin/sites") {
    if (method === "POST") {
      const next = [
        {
          id: id("demo-site"),
          organizationId: ids.organization,
          code: text(payload.code, "SITE").toUpperCase(),
          name: text(payload.name, "Sede nueva"),
          status: "active",
          timezone: text(payload.timezone, "Europe/Madrid"),
          countryCode: text(payload.countryCode, "ES").toUpperCase(),
          gatewaysTotal: 0,
          gatewaysOnline: 0,
          createdAt: now(),
        },
        ...sites(),
      ];
      save("wpass.clean.sites", next);
      return next[0] as T;
    }
    return sites() as T;
  }

  if (/\/api\/v1\/admin\/sites\/[^/]+$/.test(path)) {
    const itemId = path.split("/")[5] ?? "";
    if (method === "DELETE") {
      deleteFromCollection("wpass.clean.sites", sites(), itemId);
      return { archived: true } as T;
    }
    return updateCollection("wpass.clean.sites", sites(), itemId, {
      code: text(payload.code).toUpperCase(),
      name: text(payload.name),
      countryCode: text(payload.countryCode, "ES").toUpperCase(),
      timezone: text(payload.timezone, "Europe/Madrid"),
    }) as T;
  }

  if (path === "/api/v1/admin/gateways") {
    if (method === "POST") {
      const site = sites().find((item: JsonRecord) => item.id === payload.siteId) ?? sites()[0];
      const next = [
        {
          id: id("demo-gateway"),
          siteId: String(site.id),
          siteName: String(site.name),
          siteCode: String(site.code),
          name: text(payload.name, "RouterBOARD nuevo"),
          model: text(payload.model) || null,
          serial: text(payload.serial) || null,
          nasIdentifier: text(payload.nasIdentifier, "gateway-demo"),
          status: "pending",
          routerOsVersion: null,
          lastSeenAt: null,
          createdAt: now(),
        },
        ...gateways(),
      ];
      save("wpass.clean.gateways", next);
      return next[0] as T;
    }
    return gateways() as T;
  }

  if (/\/api\/v1\/admin\/gateways\/[^/]+$/.test(path)) {
    const itemId = path.split("/")[5] ?? "";
    if (method === "DELETE") {
      deleteFromCollection("wpass.clean.gateways", gateways(), itemId);
      return { archived: true } as T;
    }
    const site = sites().find((item: JsonRecord) => item.id === payload.siteId) ?? sites()[0];
    return updateCollection("wpass.clean.gateways", gateways(), itemId, {
      siteId: String(site.id),
      siteName: String(site.name),
      siteCode: String(site.code),
      name: text(payload.name),
      nasIdentifier: text(payload.nasIdentifier),
      model: text(payload.model) || null,
      serial: text(payload.serial) || null,
      status: text(payload.status, "online"),
    }) as T;
  }

  if (path === "/api/v1/admin/policies") {
    if (method === "POST") {
      const next = [
        {
          id: id("demo-policy"),
          name: text(payload.name, "Servicio WiFi"),
          status: "active",
          versionId: id("demo-policy-version"),
          version: 1,
          versionStatus: "published",
          downloadKbps: Number(payload.downloadKbps || 0) || null,
          uploadKbps: Number(payload.uploadKbps || 0) || null,
          sessionTimeoutSeconds: Number(payload.sessionTimeoutHours || 24) * 3600,
          quotaBytes: payload.quotaGb ? String(Number(payload.quotaGb) * 1024 ** 3) : null,
          maxConcurrentDevices: Number(payload.maxConcurrentDevices || 1),
          createdAt: now(),
        },
        ...policies(),
      ];
      save("wpass.clean.policies", next);
      return next[0] as T;
    }
    return policies() as T;
  }

  if (/\/api\/v1\/admin\/policies\/[^/]+$/.test(path)) {
    const itemId = path.split("/")[5] ?? "";
    if (method === "DELETE") {
      deleteFromCollection("wpass.clean.policies", policies(), itemId);
      return { archived: true } as T;
    }
    return updateCollection("wpass.clean.policies", policies(), itemId, {
      name: text(payload.name),
      downloadKbps: Number(payload.downloadKbps || 0) || null,
      uploadKbps: Number(payload.uploadKbps || 0) || null,
      sessionTimeoutSeconds: Number(payload.sessionTimeoutHours || 24) * 3600,
      quotaBytes: payload.quotaGb ? String(Number(payload.quotaGb) * 1024 ** 3) : null,
      maxConcurrentDevices: Number(payload.maxConcurrentDevices || 1),
    }) as T;
  }

  if (path === "/api/v1/admin/portals") {
    if (method === "POST") {
      const next = [
        {
          id: id("demo-portal"),
          name: text(payload.name, "Portal cliente"),
          kind: "wifi",
          versionId: id("demo-portal-version"),
          version: 1,
          status: "draft",
          fallbackLocale: "es",
          headline: text(payload.headline, "Bienvenido al WiFi"),
          body: text(payload.body, "Introduce tus datos para acceder a Internet."),
          logoUrl: text(payload.logoUrl) || null,
          redirectUrl: text(payload.redirectUrl, "https://www.entelsat.com/"),
          primaryColor: text(payload.primaryColor, "#0d9488"),
          siteNames: [],
          publications: [],
          createdAt: now(),
        },
        ...portals(),
      ];
      save("wpass.clean.portals", next);
      return next[0] as T;
    }
    return portals() as T;
  }

  if (/\/api\/v1\/admin\/portals\/[^/]+\/publish$/.test(path)) {
    const portalId = path.split("/")[5] ?? "";
    const site = sites().find((item: JsonRecord) => item.id === payload.siteId) ?? sites()[0];
    const next = portals().map((portal: JsonRecord) =>
      portal.id === portalId
        ? {
            ...portal,
            status: "published",
            siteNames: [String(site.name)],
            publications: [
              {
                id: id("demo-publication"),
                siteId: String(site.id),
                siteName: String(site.name),
                startsAt: now(),
                endsAt: null,
                active: true,
              },
            ],
          }
        : portal,
    );
    save("wpass.clean.portals", next);
    return { active: true, siteId: site.id, siteName: site.name } as T;
  }

  if (/\/api\/v1\/admin\/portals\/[^/]+$/.test(path)) {
    const itemId = path.split("/")[5] ?? "";
    if (method === "DELETE") {
      deleteFromCollection("wpass.clean.portals", portals(), itemId);
      return { archived: true } as T;
    }
    return updateCollection("wpass.clean.portals", portals(), itemId, {
      name: text(payload.name),
      headline: text(payload.headline),
      body: text(payload.body),
      logoUrl: text(payload.logoUrl) || null,
      redirectUrl: text(payload.redirectUrl, "https://www.entelsat.com/"),
      primaryColor: text(payload.primaryColor, "#0d9488"),
    }) as T;
  }

  if (path === "/api/v1/admin/marketing/contacts") return marketingContacts() as T;
  if (path === "/api/v1/admin/voucher-batches") return voucherBatches() as T;

  if (/\/api\/v1\/admin\/voucher-batches\/[^/]+$/.test(path)) {
    const itemId = path.split("/")[5] ?? "";
    if (method === "DELETE") {
      deleteFromCollection("wpass.clean.voucherBatches", voucherBatches(), itemId);
      return { archived: true } as T;
    }
    return updateCollection("wpass.clean.voucherBatches", voucherBatches(), itemId, {
      name: text(payload.name),
      expiresAt: text(payload.expiresAt),
      defaultMaxUses: Number(payload.defaultMaxUses || 1),
      defaultMaxDevices: Number(payload.defaultMaxDevices || 1),
    }) as T;
  }

  if (/\/api\/v1\/admin\/voucher-batches\/[^/]+\/tickets$/.test(path)) {
    const batch = voucherBatches()[0] as JsonRecord;
    return {
      ...batch,
      codes: [
        {
          id: "demo-voucher-code",
          code: "WPASS-DEMO-2026",
          displayHint: "WPASS…2026",
          state: "issued",
          usedCount: 0,
          maxUses: 1,
          maxDevices: 1,
          expiresAt: batch.expiresAt,
          revokedAt: null,
        },
      ],
    } as T;
  }

  if (/\/api\/v1\/admin\/gateways\/[^/]+\/link-material$/.test(path)) {
    const gatewayId = path.split("/")[5] ?? ids.gateway;
    const gateway =
      gateways().find((item: JsonRecord) => item.id === gatewayId) ?? (gateways()[0] as JsonRecord);
    return {
      gatewayId: String(gateway.id),
      gatewayName: String(gateway.name),
      siteName: String(gateway.siteName),
      nasIdentifier: String(gateway.nasIdentifier),
      tunnelClientIp: text(payload.tunnelClientIp, "10.255.0.10"),
      hotspotDnsName: text(payload.hotspotDnsName, "login.wpass.local"),
      gatewayLocator: "demo-gateway-locator-2026",
      radiusSecret: "demo-radius-secret-change-me",
      radiusClientLine: `${text(payload.tunnelClientIp, "10.255.0.10")}\t${String(gateway.nasIdentifier)}\tdemo-radius-secret-change-me`,
      allowedLoginOrigins: ["http://login.wpass.local", "https://login.wpass.local"],
    } as T;
  }

  if (method === "PATCH" || method === "DELETE" || method === "POST") {
    return { ok: true, archived: method === "DELETE" } as T;
  }

  return [] as T;
}
