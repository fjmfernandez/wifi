import type { AgentEnvironment, AgentLogLevel } from "../config/environment.js";

type SafeScalar = string | number | boolean | null;
export type SafeLogFields = Readonly<Record<string, SafeScalar | readonly SafeScalar[]>>;

export interface AgentLogger {
  debug(message: string, fields?: SafeLogFields): void;
  info(message: string, fields?: SafeLogFields): void;
  warn(message: string, fields?: SafeLogFields): void;
  error(message: string, fields?: SafeLogFields): void;
}

export type LogWriter = (line: string) => void;

const LEVELS: Readonly<Record<Exclude<AgentLogLevel, "silent">, number>> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const SENSITIVE_KEY =
  /(?:^|_)(?:password|secret|token|authorization|cookie|credential|privatekey|private_key|certificate|payload)(?:$|_)/i;

function redact(fields: SafeLogFields | undefined): SafeLogFields {
  if (!fields) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[REDACTED]" : value,
    ]),
  );
}

export function safeErrorFields(error: unknown): SafeLogFields {
  if (!(error instanceof Error)) {
    return { errorName: "NonErrorThrown", errorCode: "UNEXPECTED_ERROR" };
  }
  const candidateCode = "code" in error && typeof error.code === "string" ? error.code : "";
  return {
    errorName: /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(error.name) ? error.name : "Error",
    errorCode: /^[A-Z][A-Z0-9_]{1,63}$/.test(candidateCode) ? candidateCode : "UNEXPECTED_ERROR",
  };
}

export function createLogger(
  environment: Pick<AgentEnvironment, "logLevel" | "buildSha" | "nodeEnvironment">,
  writer: LogWriter = (line) => process.stdout.write(`${line}\n`),
  now: () => Date = () => new Date(),
): AgentLogger {
  const threshold =
    environment.logLevel === "silent" ? Number.POSITIVE_INFINITY : LEVELS[environment.logLevel];

  const write = (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    fields?: SafeLogFields,
  ): void => {
    if (LEVELS[level] < threshold) {
      return;
    }
    writer(
      JSON.stringify({
        timestamp: now().toISOString(),
        level,
        service: "wifi-site-agent",
        environment: environment.nodeEnvironment,
        buildSha: environment.buildSha,
        message,
        ...redact(fields),
      }),
    );
  };

  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
  };
}
