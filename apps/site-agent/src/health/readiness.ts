import type { AgentEnvironment } from "../config/environment.js";
import type { SqliteStore } from "../storage/sqlite-store.js";
import type { RuntimeState } from "../runtime/runtime-state.js";

export interface ReadinessResult {
  readonly ready: boolean;
  readonly checks: Readonly<{
    storage: { readonly ok: boolean };
    enrolled: { readonly ok: boolean };
    certificate: { readonly ok: boolean };
    runtime: { readonly ok: boolean };
    cloud: { readonly ok: boolean };
    apply: { readonly ok: false; readonly status: "BLOCKED_BY_LAB_VALIDATION" };
  }>;
}

export class ReadinessService {
  constructor(
    private readonly environment: Pick<AgentEnvironment, "readinessMaxCloudStalenessMs">,
    private readonly store: SqliteStore,
    private readonly runtimeState: RuntimeState,
    private readonly now: () => Date = () => new Date(),
  ) {}

  check(): ReadinessResult {
    let storageOk: boolean;
    let enrolled = false;
    let certificateOk = false;
    try {
      storageOk = this.store.isHealthy();
      const identity = this.store.loadIdentity();
      enrolled = identity !== undefined;
      certificateOk =
        identity !== undefined && Date.parse(identity.certificateNotAfter) > this.now().getTime();
    } catch {
      storageOk = false;
    }
    const lastCloudSuccess = this.runtimeState.lastCloudSuccessAt;
    const cloudOk =
      lastCloudSuccess !== undefined &&
      this.now().getTime() - lastCloudSuccess.getTime() <=
        this.environment.readinessMaxCloudStalenessMs;
    const checks = {
      storage: { ok: storageOk },
      enrolled: { ok: enrolled },
      certificate: { ok: certificateOk },
      runtime: { ok: this.runtimeState.running },
      cloud: { ok: cloudOk },
      apply: { ok: false as const, status: "BLOCKED_BY_LAB_VALIDATION" as const },
    };
    return {
      ready: storageOk && enrolled && certificateOk && this.runtimeState.running && cloudOk,
      checks,
    };
  }
}
