import { describe, expect, it } from "vitest";

import { compileEffectivePolicy, explainPolicy, resolveEffectivePolicy } from "./policy.js";

describe("policy resolution", () => {
  it("uses deterministic site > group > organization > tenant precedence", () => {
    const result = resolveEffectivePolicy("Invitados", [
      { layer: "site", resourceId: "site-1", values: { portLimit: 3 } },
      {
        layer: "tenant",
        resourceId: "tenant-1",
        values: { portLimit: 1, interimIntervalSeconds: 300 },
      },
      { layer: "organization", resourceId: "org-1", values: { interimIntervalSeconds: 180 } },
    ]);
    expect(result.policy.portLimit).toBe(3);
    expect(result.policy.interimIntervalSeconds).toBe(180);
    expect(result.sources.portLimit).toEqual({ layer: "site", resourceId: "site-1" });
  });

  it("maps client upload/download to NAS RX/TX without ambiguity", () => {
    const attributes = compileEffectivePolicy("auth:01", {
      name: "Premium",
      interimIntervalSeconds: 300,
      portLimit: 2,
      bandwidth: { uploadKbps: 20_000, downloadKbps: 100_000 },
    });
    expect(attributes).toContainEqual({
      attribute: "Mikrotik-Rate-Limit",
      op: ":=",
      value: "20000k/100000k",
    });
    expect(attributes).toContainEqual({ attribute: "Port-Limit", op: ":=", value: "2" });
  });

  it("does not silently claim an unvalidated quota", () => {
    const input = {
      name: "Cuota",
      interimIntervalSeconds: 300,
      portLimit: 1,
      totalBytesLimit: 1024,
    };
    expect(explainPolicy(input)).toContainEqual(expect.objectContaining({ severity: "blocked" }));
    expect(() => compileEffectivePolicy("auth:01", input)).toThrow(/Mikrotik-Total-Limit/);
  });
});
