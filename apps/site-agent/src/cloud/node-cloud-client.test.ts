import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import type { AgentIdentityMaterial, AgentOutboxEvent, EnrollmentRequest } from "../contracts.js";
import { NodeCloudClient } from "./node-cloud-client.js";

const closeCallbacks: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const close of closeCallbacks.splice(0)) {
    await close();
  }
});

describe("node cloud transport", () => {
  it("uses fixed POST endpoints, a header-only enrollment token and idempotent event delivery", async () => {
    const requests: {
      readonly path: string;
      readonly authorization?: string;
      readonly idempotency?: string;
      readonly body: string;
    }[] = [];
    const server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        requests.push({
          path: request.url ?? "",
          ...(typeof request.headers.authorization === "string"
            ? { authorization: request.headers.authorization }
            : {}),
          ...(typeof request.headers["idempotency-key"] === "string"
            ? { idempotency: request.headers["idempotency-key"] }
            : {}),
          body: Buffer.concat(chunks).toString("utf8"),
        });
        if (request.url === "/api/v1/site-agent/enroll") {
          response.setHeader("content-type", "application/json");
          response.end(
            JSON.stringify({
              protocolVersion: 1,
              identityId: "0198a000-0000-7000-8000-000000000011",
              tenantId: "0198a000-0000-7000-8000-000000000001",
              gatewayId: "0198a000-0000-7000-8000-000000000021",
              certificatePem: `-----BEGIN CERTIFICATE-----\n${"A".repeat(80)}\n-----END CERTIFICATE-----`,
              caCertificatePem: `-----BEGIN CERTIFICATE-----\n${"B".repeat(80)}\n-----END CERTIFICATE-----`,
              certificateNotAfter: "2027-08-16T10:00:00.000Z",
              initialCommandSequence: 0,
            }),
          );
          return;
        }
        if (request.url === "/api/v1/site-agent/commands/lease") {
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ protocolVersion: 1, commands: [] }));
          return;
        }
        response.statusCode = 204;
        response.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    closeCallbacks.push(
      async () =>
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    );
    const address = server.address() as AddressInfo;
    const client = new NodeCloudClient({
      cloudOrigin: `http://127.0.0.1:${address.port}`,
      cloudTimeoutMs: 2_000,
      buildSha: "1234567",
    });
    const enrollmentRequest: EnrollmentRequest = {
      protocolVersion: 1,
      agentVersion: "0.1.0",
      hostname: "test-agent",
      publicKeySpkiBase64: "cHVibGljLWtleQ==",
      nonce: "nonce",
      capabilities: ["inventory.read", "provisioning.preview"],
    };
    const enrollment = await client.enroll(
      enrollmentRequest,
      "enrollment_token_abcdefghijklmnopqrstuvwxyz0123456789",
    );
    const identity: AgentIdentityMaterial = {
      ...enrollment,
      privateKeyPem: "unused-over-http",
      enrolledAt: "2026-08-16T10:00:00.000Z",
    };
    await client.leaseCommands(identity, 7, 10);
    const event: AgentOutboxEvent = {
      id: "0198a000-0000-7000-8000-000000000201",
      protocolVersion: 1,
      identityId: identity.identityId,
      tenantId: identity.tenantId,
      gatewayId: identity.gatewayId,
      type: "agent.heartbeat",
      occurredAt: "2026-08-16T10:00:00.000Z",
      payload: {},
    };
    await client.publishEvent(identity, event);

    expect(requests.map((request) => request.path)).toEqual([
      "/api/v1/site-agent/enroll",
      "/api/v1/site-agent/commands/lease",
      "/api/v1/site-agent/events",
    ]);
    expect(requests[0]?.authorization).toMatch(/^Bearer /);
    expect(requests[0]?.path).not.toContain("token");
    expect(JSON.parse(requests[1]?.body ?? "{}")).toMatchObject({ afterSequence: 7 });
    expect(requests[2]?.idempotency).toBe(event.id);
  });
});
