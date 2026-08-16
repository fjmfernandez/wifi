import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { WorkerEnvironment } from "../config/environment.js";
import type { ReadinessResult } from "./readiness.js";

export type ReadinessProbe = () => Promise<ReadinessResult>;

export class HealthServer {
  private server: Server | undefined;

  constructor(
    private readonly environment: WorkerEnvironment,
    private readonly readinessProbe: ReadinessProbe,
  ) {}

  async listen(): Promise<void> {
    if (this.server) {
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
        void this.handle(request, response);
      },
    );
    this.server = server;

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
      server.listen(this.environment.WORKER_HEALTH_PORT, this.environment.WORKER_HEALTH_HOST);
    });
  }

  async close(): Promise<void> {
    const server = this.server;
    if (!server) {
      return;
    }
    this.server = undefined;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
      server.closeIdleConnections();
    });
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("allow", "GET, HEAD");
      this.send(response, request.method === "HEAD", 405, { status: "method_not_allowed" });
      return;
    }

    if (request.url === "/health/live") {
      this.send(response, request.method === "HEAD", 200, {
        status: "up",
        service: "wifi-worker",
        buildSha: this.environment.BUILD_SHA,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (request.url === "/health/ready") {
      try {
        const readiness = await this.readinessProbe();
        this.send(response, request.method === "HEAD", readiness.ready ? 200 : 503, {
          status: readiness.ready ? "ready" : "not_ready",
          service: "wifi-worker",
          buildSha: this.environment.BUILD_SHA,
          checks: readiness.checks,
          timestamp: new Date().toISOString(),
        });
      } catch {
        this.send(response, request.method === "HEAD", 503, {
          status: "not_ready",
          service: "wifi-worker",
          buildSha: this.environment.BUILD_SHA,
          checks: { probe: { ok: false } },
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }

    this.send(response, request.method === "HEAD", 404, { status: "not_found" });
  }

  private send(
    response: ServerResponse,
    headOnly: boolean,
    statusCode: number,
    body: Readonly<Record<string, unknown>>,
  ): void {
    response.statusCode = statusCode;
    if (headOnly) {
      response.end();
      return;
    }
    response.end(JSON.stringify(body));
  }
}
