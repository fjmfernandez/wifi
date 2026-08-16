import pino, { type Logger } from "pino";
import type { WorkerEnvironment } from "../config/environment.js";
import { currentJobContext } from "./job-context.js";

const REDACTED_PATHS = [
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "redisUrl",
  "REDIS_URL",
  "databaseUrl",
  "DATABASE_URL",
  "connectionString",
  "*.password",
  "*.secret",
  "*.token",
  "*.authorization",
  "*.cookie",
  "*.redisUrl",
  "*.REDIS_URL",
  "*.databaseUrl",
  "*.DATABASE_URL",
  "*.connectionString",
  "req.headers.authorization",
  "req.headers.cookie",
  "job.data",
] as const;

export function createLogger(environment: WorkerEnvironment): Logger {
  return pino({
    level: environment.LOG_LEVEL,
    base: {
      service: "wifi-worker",
      environment: environment.NODE_ENV,
      buildSha: environment.BUILD_SHA,
    },
    messageKey: "message",
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [...REDACTED_PATHS],
      censor: "[REDACTED]",
    },
    mixin() {
      return currentJobContext() ?? {};
    },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  });
}

export function safeErrorFields(error: unknown): Readonly<Record<string, string>> {
  if (error instanceof Error) {
    const candidateCode = "code" in error && typeof error.code === "string" ? error.code : "";
    const errorCode = /^[A-Z][A-Z0-9_]{1,63}$/.test(candidateCode)
      ? candidateCode
      : "UNEXPECTED_ERROR";
    const errorName = /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name) ? error.name : "Error";
    return { errorName, errorCode };
  }
  return { errorName: "NonErrorThrown", errorCode: "UNEXPECTED_ERROR" };
}
