import { Injectable } from "@nestjs/common";

export interface ReadinessCheckResult {
  name: string;
  status: "up" | "down" | "degraded";
  latencyMs: number;
  detail?: string;
}

export interface ReadinessProbe {
  readonly name: string;
  check(): Promise<Omit<ReadinessCheckResult, "name" | "latencyMs">>;
}

@Injectable()
export class ReadinessService {
  private readonly probes = new Map<string, ReadinessProbe>();

  register(probe: ReadinessProbe): () => void {
    if (this.probes.has(probe.name)) {
      throw new Error(`Readiness probe duplicado: ${probe.name}`);
    }
    this.probes.set(probe.name, probe);
    return () => this.probes.delete(probe.name);
  }

  async check(): Promise<ReadinessCheckResult[]> {
    return Promise.all(
      [...this.probes.values()].map(async (probe) => {
        const startedAt = performance.now();
        try {
          const result = await probe.check();
          return {
            name: probe.name,
            ...result,
            latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
          };
        } catch (error) {
          return {
            name: probe.name,
            status: "down" as const,
            latencyMs: Math.round((performance.now() - startedAt) * 100) / 100,
            detail: error instanceof Error ? error.message : "unknown_error",
          };
        }
      }),
    );
  }
}
