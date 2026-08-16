import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createApiDatabaseClient,
  resolveCaptiveAttemptHash,
  resolveCaptiveLocatorHash,
  withTenant,
  type CaptiveAttemptRoute,
  type CaptiveLocatorRoute,
  type PrismaClient,
  type TenantTransaction,
} from "@wifi-entelsat/database";

import type { AppEnvironment } from "../config/environment.js";
import { ReadinessService } from "../health/readiness.service.js";

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient;
  private readonly logger = new Logger(DatabaseService.name);
  private unregisterReadiness?: () => void;

  constructor(
    config: ConfigService<AppEnvironment, true>,
    private readonly readiness: ReadinessService,
  ) {
    this.client = createApiDatabaseClient(config.getOrThrow<string>("DATABASE_URL"), {
      applicationName: "wifi-entelsat-api",
      connectionLimit: config.get("DATABASE_POOL_SIZE", { infer: true }),
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    });
  }

  onModuleInit(): void {
    this.unregisterReadiness = this.readiness.register({
      name: "postgresql",
      check: async () => {
        const rows = await this.client.$queryRaw<Array<{ role: string }>>`
          SELECT current_role::text AS role
        `;
        return rows[0]?.role === "wifi_app_runtime"
          ? { status: "up" }
          : { status: "down", detail: "unexpected_database_role" };
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.unregisterReadiness?.();
    try {
      await this.client.$disconnect();
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : "database_disconnect_failed");
    }
  }

  withTenant<T>(
    tenantId: string,
    operation: (transaction: TenantTransaction) => Promise<T>,
  ): Promise<T> {
    return withTenant(this.client, tenantId, operation);
  }

  resolveCaptiveLocator(locatorHash: Uint8Array): Promise<CaptiveLocatorRoute | null> {
    return resolveCaptiveLocatorHash(this.client, locatorHash);
  }

  resolveCaptiveAttempt(stateHash: Uint8Array): Promise<CaptiveAttemptRoute | null> {
    return resolveCaptiveAttemptHash(this.client, stateHash);
  }
}
