import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient } from "redis";

import type { AppEnvironment } from "../config/environment.js";
import { ReadinessService } from "../health/readiness.service.js";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client;
  private connectPromise: Promise<void> | undefined;
  private unregisterReadiness?: () => void;

  constructor(
    config: ConfigService<AppEnvironment, true>,
    private readonly readiness: ReadinessService,
  ) {
    this.client = createClient({
      url: config.getOrThrow<string>("REDIS_URL"),
      socket: {
        connectTimeout: config.get("REDIS_CONNECT_TIMEOUT_MS", { infer: true }),
        reconnectStrategy: (retries) => Math.min(100 * 2 ** Math.min(retries, 6), 5_000),
      },
    });
    this.client.on("error", () => this.logger.warn("redis_connection_error"));
  }

  onModuleInit(): void {
    this.unregisterReadiness = this.readiness.register({
      name: "redis",
      check: async () => {
        await this.ensureConnected();
        return (await this.client.ping()) === "PONG"
          ? { status: "up" }
          : { status: "down", detail: "unexpected_redis_response" };
      },
    });
    void this.ensureConnected().catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    this.unregisterReadiness?.();
    if (this.client.isOpen) await this.client.close();
  }

  async incrementWindow(key: string, ttlSeconds: number): Promise<number> {
    await this.ensureConnected();
    const result = await this.client.eval(
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
      { keys: [key], arguments: [String(ttlSeconds)] },
    );
    if (typeof result !== "number") throw new Error("unexpected_rate_limit_response");
    return result;
  }

  async delete(key: string): Promise<void> {
    await this.ensureConnected();
    await this.client.del(key);
  }

  private ensureConnected(): Promise<void> {
    if (this.client.isReady) return Promise.resolve();
    if (!this.connectPromise) {
      const connection = this.client.isOpen
        ? Promise.resolve()
        : this.client.connect().then(() => undefined);
      const tracked = connection.finally(() => {
        this.connectPromise = undefined;
      });
      this.connectPromise = tracked;
      return tracked;
    }
    return this.connectPromise;
  }
}
