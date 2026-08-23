import { describe, expect, it } from "vitest";

import {
  buildProvisioningPlan,
  renderExternalLoginHtml,
  renderReviewableScript,
} from "./provisioning.js";

const input = {
  revision: 3,
  mode: "hotspot-only",
  gatewayName: "miramar-core-01",
  nasIdentifier: "miramar-core-01",
  hotspotName: "guest-hotspot",
  guestInterface: "vlan-guest",
  dnsName: "wifi-login.miramar.example",
  captiveOrigin: "https://captive.wpass.es",
  radiusPrimary: "10.80.0.11",
  radiusSecondary: "10.80.0.12",
  radiusSecretVariable: "$WPASS_RADIUS_SECRET",
  interimIntervalSeconds: 300,
} as const;

describe("MikroTik provisioning plan", () => {
  it("produces a deterministic, reviewable preview with backup first", () => {
    const first = buildProvisioningPlan(input);
    const second = buildProvisioningPlan(input);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.status).toBe("preview_only");
    expect(first.backup[0]).toContain("backup save");
    expect(renderReviewableScript(first)).toContain("PREVIEW ONLY");
  });

  it("rejects script injection in RouterOS object names", () => {
    expect(() =>
      buildProvisioningPlan({ ...input, hotspotName: "guest]; /system reset" }),
    ).toThrow();
  });

  it("creates a POST-only router shim without credentials in the URL", () => {
    const html = renderExternalLoginHtml(input.captiveOrigin, "gateway_locator_1234567890");
    expect(html).toContain('method="post"');
    expect(html).toContain("$(link-login)");
    expect(html).not.toContain("password");
  });
});
