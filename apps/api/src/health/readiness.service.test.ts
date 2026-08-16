import { describe, expect, it } from "vitest";
import { ReadinessService } from "./readiness.service.js";

describe("ReadinessService", () => {
  it("aísla fallos de probes y conserva evidencia", async () => {
    const service = new ReadinessService();
    service.register({
      name: "postgres",
      async check() {
        throw new Error("connection_refused");
      },
    });

    await expect(service.check()).resolves.toEqual([
      expect.objectContaining({
        name: "postgres",
        status: "down",
        detail: "connection_refused",
      }),
    ]);
  });

  it("rechaza nombres duplicados", () => {
    const service = new ReadinessService();
    const probe = {
      name: "postgres",
      async check() {
        return { status: "up" as const };
      },
    };
    service.register(probe);
    expect(() => service.register(probe)).toThrow("duplicado");
  });
});
