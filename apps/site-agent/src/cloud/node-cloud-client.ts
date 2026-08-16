import http, { type RequestOptions } from "node:http";
import https from "node:https";

import type { AgentEnvironment } from "../config/environment.js";
import {
  parseCommandLeaseResponse,
  parseEnrollmentResponse,
  type AgentIdentityMaterial,
  type AgentOutboxEvent,
  type CommandLeaseResponse,
  type EnrollmentRequest,
  type EnrollmentResponse,
} from "../contracts.js";
import type { AgentCloudPort, EnrollmentCloudPort } from "./cloud-port.js";

const MAX_RESPONSE_BYTES = 1_048_576;

export class CloudRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "CloudRequestError";
  }
}

interface RequestIdentity {
  readonly certificatePem: string;
  readonly privateKeyPem: string;
  readonly caCertificatePem: string;
}

export class NodeCloudClient implements EnrollmentCloudPort, AgentCloudPort {
  readonly #origin: URL;
  readonly #timeoutMs: number;
  readonly #buildSha: string;

  constructor(environment: Pick<AgentEnvironment, "cloudOrigin" | "cloudTimeoutMs" | "buildSha">) {
    this.#origin = new URL(environment.cloudOrigin);
    this.#timeoutMs = environment.cloudTimeoutMs;
    this.#buildSha = environment.buildSha;
  }

  async enroll(request: EnrollmentRequest, oneTimeToken: string): Promise<EnrollmentResponse> {
    const response = await this.#requestJson(
      "/api/v1/site-agent/enroll",
      request,
      { authorization: `Bearer ${oneTimeToken}` },
      undefined,
      false,
    );
    return parseEnrollmentResponse(response);
  }

  async leaseCommands(
    identity: AgentIdentityMaterial,
    afterSequence: number,
    maximumCommands: number,
  ): Promise<CommandLeaseResponse> {
    const response = await this.#requestJson(
      "/api/v1/site-agent/commands/lease",
      {
        protocolVersion: 1,
        identityId: identity.identityId,
        gatewayId: identity.gatewayId,
        afterSequence,
        maximumCommands,
      },
      {},
      identity,
      false,
    );
    return parseCommandLeaseResponse(response);
  }

  async publishEvent(identity: AgentIdentityMaterial, event: AgentOutboxEvent): Promise<void> {
    await this.#requestJson(
      "/api/v1/site-agent/events",
      event,
      { "idempotency-key": event.id },
      identity,
      true,
    );
  }

  async #requestJson(
    path: string,
    body: unknown,
    headers: Readonly<Record<string, string>>,
    identity: RequestIdentity | undefined,
    allowEmpty: boolean,
  ): Promise<unknown> {
    const payload = Buffer.from(JSON.stringify(body), "utf8");
    const secure = this.#origin.protocol === "https:";
    const options: RequestOptions = {
      protocol: this.#origin.protocol,
      hostname: this.#origin.hostname,
      port: this.#origin.port || undefined,
      path,
      method: "POST",
      agent: false,
      headers: {
        accept: "application/json",
        "content-type": "application/json; charset=utf-8",
        "content-length": String(payload.byteLength),
        "user-agent": `wifi-entelsat-site-agent/${this.#buildSha}`,
        ...headers,
      },
      ...(secure
        ? {
            minVersion: "TLSv1.3" as const,
            rejectUnauthorized: true,
            ...(identity
              ? {
                  cert: `${identity.certificatePem}\n${identity.caCertificatePem}`,
                  key: identity.privateKeyPem,
                }
              : {}),
          }
        : {}),
    };

    return await new Promise<unknown>((resolve, reject) => {
      const request = (secure ? https.request : http.request)(options, (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.length;
          if (size > MAX_RESPONSE_BYTES) {
            response.destroy(
              new CloudRequestError("Cloud response was too large", "CLOUD_RESPONSE_TOO_LARGE"),
            );
            return;
          }
          chunks.push(buffer);
        });
        response.once("error", reject);
        response.once("end", () => {
          const responseStatus = response.statusCode ?? 0;
          if (responseStatus < 200 || responseStatus >= 300) {
            reject(
              new CloudRequestError(
                "Cloud request returned a non-success status",
                `CLOUD_HTTP_${responseStatus || "INVALID"}`,
              ),
            );
            return;
          }
          const responseBody = Buffer.concat(chunks).toString("utf8");
          if (responseBody.length === 0 && allowEmpty) {
            resolve(undefined);
            return;
          }
          const contentType = response.headers["content-type"];
          if (typeof contentType !== "string" || !/^application\/json(?:;|$)/i.test(contentType)) {
            reject(
              new CloudRequestError(
                "Cloud response had an unsupported media type",
                "CLOUD_RESPONSE_CONTENT_TYPE_INVALID",
              ),
            );
            return;
          }
          try {
            resolve(JSON.parse(responseBody) as unknown);
          } catch {
            reject(
              new CloudRequestError("Cloud response was not valid JSON", "CLOUD_RESPONSE_INVALID"),
            );
          }
        });
      });
      const deadline = setTimeout(() => {
        request.destroy(new CloudRequestError("Cloud request timed out", "CLOUD_TIMEOUT"));
      }, this.#timeoutMs);
      deadline.unref();
      request.once("close", () => clearTimeout(deadline));
      request.once("error", reject);
      request.end(payload);
    });
  }
}
