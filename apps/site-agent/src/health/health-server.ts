import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { AgentEnvironment } from "../config/environment.js";
import type { ReadinessService } from "./readiness.js";

type HealthEnvironment = Pick<AgentEnvironment, "healthHost" | "healthPort" | "buildSha">;

export class HealthServer {
  #server: Server | undefined;

  constructor(
    private readonly environment: HealthEnvironment,
    private readonly readiness: ReadinessService,
  ) {}

  async listen(): Promise<void> {
    if (this.#server) {
      return;
    }
    const server = createServer(
      {
        headersTimeout: 5_000,
        requestTimeout: 5_000,
        keepAliveTimeout: 5_000,
        maxHeaderSize: 8_192,
      },
      (request, response) => {
        this.#handle(request, response);
      },
    );
    this.#server = server;
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = (): void => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.environment.healthPort, this.environment.healthHost);
    });
  }

  async close(): Promise<void> {
    const server = this.#server;
    if (!server) {
      return;
    }
    this.#server = undefined;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeIdleConnections();
    });
  }

  #handle(request: IncomingMessage, response: ServerResponse): void {
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("allow", "GET, HEAD");
      this.#send(response, request.method === "HEAD", 405, { status: "method_not_allowed" });
      return;
    }
    if (request.url === "/health/live") {
      this.#send(response, request.method === "HEAD", 200, {
        status: "up",
        service: "wifi-site-agent",
        buildSha: this.environment.buildSha,
        mode: "preview_only",
      });
      return;
    }
    if (request.url === "/health/ready") {
      const readiness = this.readiness.check();
      this.#send(response, request.method === "HEAD", readiness.ready ? 200 : 503, {
        status: readiness.ready ? "ready" : "not_ready",
        service: "wifi-site-agent",
        buildSha: this.environment.buildSha,
        checks: readiness.checks,
      });
      return;
    }
    this.#send(response, request.method === "HEAD", 404, { status: "not_found" });
  }

  #send(
    response: ServerResponse,
    headOnly: boolean,
    statusCode: number,
    body: Readonly<Record<string, unknown>>,
  ): void {
    response.statusCode = statusCode;
    response.end(headOnly ? undefined : JSON.stringify(body));
  }
}
