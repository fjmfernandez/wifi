export interface RouterInventory {
  readonly reachable: boolean;
  readonly model?: string;
  readonly architecture?: string;
  readonly routerOsVersion?: string;
  readonly identity?: string;
  readonly uptimeSeconds?: number;
  readonly cpuLoadPercent?: number;
  readonly freeMemoryBytes?: number;
}

export interface ReadOnlyExecutionResult {
  readonly ok: boolean;
  readonly code: string;
  readonly durationMs: number;
}

export interface RouterOsAdapter {
  readInventory(): Promise<RouterInventory>;
  executeReadOnly(command: string): Promise<ReadOnlyExecutionResult>;
}

export class PreviewOnlyRouterOsAdapter implements RouterOsAdapter {
  async readInventory(): Promise<RouterInventory> {
    return { reachable: false };
  }

  async executeReadOnly(_command: string): Promise<ReadOnlyExecutionResult> {
    return {
      ok: false,
      code: "BLOCKED_BY_LAB_VALIDATION",
      durationMs: 0,
    };
  }
}
