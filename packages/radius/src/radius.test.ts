import { describe, expect, it } from "vitest";
import {
  BlockedByLabValidationError,
  accountingEventFingerprint,
  combineRadiusOctets,
  compileSupportedReplyAttributes,
  normalizeNasCounters,
  parseCoaPort,
} from "./index.js";

describe("RADIUS policy contract", () => {
  it("emits Port-Limit and the received interim interval without Simultaneous-Use", () => {
    const attributes = compileSupportedReplyAttributes({
      opaqueClass: "authorization:018f47a5-9b2a-7ab0-91d4-28f3734a3dd9",
      interimIntervalSeconds: 300,
      portLimit: 1,
      nasRxKbps: 2_000,
      nasTxKbps: 10_000,
      sessionTimeoutSeconds: 3_600,
      idleTimeoutSeconds: 600,
    });

    expect(attributes).toContainEqual({
      attribute: "Port-Limit",
      op: ":=",
      value: "1",
    });
    expect(attributes).toContainEqual({
      attribute: "Acct-Interim-Interval",
      op: ":=",
      value: "300",
    });
    expect(attributes).toContainEqual({
      attribute: "Mikrotik-Rate-Limit",
      op: ":=",
      value: "2000k/10000k",
    });
    expect(attributes.some(({ attribute }) => attribute === ("Simultaneous-Use" as never))).toBe(
      false,
    );
  });

  it("fails closed when a total quota is requested", () => {
    expect(() =>
      compileSupportedReplyAttributes({
        opaqueClass: "authorization:test",
        interimIntervalSeconds: 300,
        portLimit: 1,
        totalQuotaBytes: 5_000_000_000n,
      }),
    ).toThrow(BlockedByLabValidationError);
  });
});

describe("RADIUS accounting contract", () => {
  it("combines octets and gigawords without signed 32-bit overflow", () => {
    expect(combineRadiusOctets(5, 1)).toBe(4_294_967_301n);
    expect(
      normalizeNasCounters({
        inputOctets: 5,
        inputGigawords: 1,
        outputOctets: 9,
        outputGigawords: 2,
      }),
    ).toEqual({
      nasInputOctets: 4_294_967_301n,
      nasOutputOctets: 8_589_934_601n,
    });
  });

  it("deduplicates an exact retransmission but keeps a legitimate next interim", () => {
    const base = {
      tenantId: "tenant-a",
      gatewayId: "gateway-a",
      nasIdentifier: "lab-router",
      acctSessionId: "session-1",
      statusType: "Interim-Update" as const,
      nasEventEpochSeconds: 1_700_000_000,
      sessionTimeSeconds: 300,
      inputOctets: 1_000,
      outputOctets: 2_000,
    };

    const first = accountingEventFingerprint(base);
    expect(accountingEventFingerprint({ ...base })).toBe(first);
    expect(
      accountingEventFingerprint({
        ...base,
        nasEventEpochSeconds: 1_700_000_300,
        sessionTimeSeconds: 600,
        inputOctets: 1_500,
      }),
    ).not.toBe(first);
  });
});

describe("CoA port contract", () => {
  it("accepts only the two explicit lab candidates", () => {
    expect(parseCoaPort("1700")).toBe(1700);
    expect(parseCoaPort(3799)).toBe(3799);
    expect(() => parseCoaPort(1812)).toThrow(RangeError);
  });
});
