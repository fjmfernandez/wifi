import { ConfigService } from "@nestjs/config";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import type { AppEnvironment } from "../config/environment.js";
import { CaptiveService } from "./captive.service.js";
import { DemoCaptiveRepository } from "./demo-captive.repository.js";

const key = Buffer.alloc(32, 7).toString("base64url");
const config = new ConfigService<AppEnvironment, true>({
  CAPTIVE_STATE_HMAC_KEY_BASE64: key,
  CAPTIVE_IDENTIFIER_HMAC_KEY_BASE64: key,
  CAPTIVE_PUBLIC_ORIGIN: "http://localhost:3002",
} as AppEnvironment);

function createService() {
  return new CaptiveService(new DemoCaptiveRepository(), config);
}

const startRequest = {
  gatewayLocator: "demo-gateway-locator-2026",
  mac: "02:11:22:33:44:55",
  ip: "10.20.30.40",
  linkLogin: "https://hotspot.local/login",
  linkOrig: "https://hotel.example/welcome",
  locale: "es",
};

describe("CaptiveService", () => {
  it("creates one-use state and rejects a replay", async () => {
    const service = createService();
    const started = await service.start(startRequest);
    const state = new URL(started.portalUrl).searchParams.get("state")!;
    const context = await service.context(state);
    const request = {
      state,
      method: "click",
      acceptedLegalVersionId: context.legalVersionId,
      marketingConsent: false,
    };
    await expect(service.authorize(request)).resolves.toMatchObject({
      loginUrl: "https://hotspot.local/login",
    });
    await expect(service.authorize(request)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a login origin that is not registered to the gateway", async () => {
    const service = createService();
    await expect(
      service.start({ ...startRequest, linkLogin: "https://attacker.example/login" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("validates voucher without consuming state on a failed attempt", async () => {
    const service = createService();
    const started = await service.start(startRequest);
    const state = new URL(started.portalUrl).searchParams.get("state")!;
    const context = await service.context(state);
    await expect(
      service.authorize({
        state,
        method: "voucher",
        voucher: "MIR-AAAA-BBBB",
        acceptedLegalVersionId: context.legalVersionId,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.authorize({
        state,
        method: "voucher",
        voucher: "MIR-7K4P-9W2D",
        acceptedLegalVersionId: context.legalVersionId,
      }),
    ).resolves.toBeDefined();
  });

  it("serves and accepts only the published legal version for the selected locale", async () => {
    const service = createService();
    const started = await service.start(startRequest);
    const state = new URL(started.portalUrl).searchParams.get("state")!;
    const context = await service.context(state);
    const english = context.legalVersions.find((version) => version.locale === "en")!;

    await expect(service.legal(state, english.id, "en")).resolves.toMatchObject({
      id: english.id,
      locale: "en",
      kind: "terms",
    });
    await expect(
      service.authorize({
        state,
        method: "click",
        locale: "en",
        acceptedLegalVersionId: context.legalVersionId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
