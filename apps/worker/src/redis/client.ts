import { createClient, type RedisClientType } from "redis";
import type { Logger } from "pino";
import type { WorkerEnvironment } from "../config/environment.js";
import { safeErrorFields } from "../logging/logger.js";

export type WorkerRedisClient = RedisClientType;

export function createWorkerRedisClient(environment: WorkerEnvironment): WorkerRedisClient {
  const redisUrl = new URL(environment.REDIS_URL);
  const socket = {
    connectTimeout: environment.REDIS_CONNECT_TIMEOUT_MS,
    reconnectStrategy(retries: number): number {
      const exponentialDelay = Math.min(250 * 2 ** Math.min(retries, 6), 10_000);
      return exponentialDelay + Math.floor(Math.random() * 250);
    },
  };

  if (redisUrl.protocol === "rediss:") {
    return createClient({
      url: environment.REDIS_URL,
      socket: {
        ...socket,
        tls: true,
        servername: redisUrl.hostname,
        rejectUnauthorized: environment.REDIS_TLS_REJECT_UNAUTHORIZED,
      },
      name: `wifi-worker-${process.pid}`,
      disableOfflineQueue: true,
    });
  }

  return createClient({
    url: environment.REDIS_URL,
    socket,
    name: `wifi-worker-${process.pid}`,
    disableOfflineQueue: true,
  });
}

export function attachRedisLogging(client: WorkerRedisClient, logger: Logger): void {
  client.on("error", (error: unknown) => {
    logger.error(safeErrorFields(error), "Redis client error");
  });
  client.on("reconnecting", () => {
    logger.warn("Redis client reconnecting");
  });
  client.on("ready", () => {
    logger.info("Redis client ready");
  });
}
