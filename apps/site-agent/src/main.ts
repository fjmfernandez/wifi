import { CommandGuard } from "./commands/command-guard.js";
import { EnrollmentService } from "./cloud/enrollment-service.js";
import { NodeCloudClient } from "./cloud/node-cloud-client.js";
import { parseEnvironment } from "./config/environment.js";
import { HealthServer } from "./health/health-server.js";
import { ReadinessService } from "./health/readiness.js";
import { createLogger, safeErrorFields } from "./logging/logger.js";
import { RouterCommandExecutor } from "./router/command-executor.js";
import { PreviewOnlyRouterOsAdapter } from "./router/router-adapter.js";
import { RuntimeState } from "./runtime/runtime-state.js";
import { SiteAgentRuntime } from "./runtime/site-agent-runtime.js";
import { NodeCertificateVerifier } from "./security/certificate-verifier.js";
import { CommandSignatureVerifier } from "./security/command-signature.js";
import { CryptoVault } from "./security/crypto-vault.js";
import { SqliteStore } from "./storage/sqlite-store.js";

async function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return;
  }
  await new Promise<void>((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
}

async function run(): Promise<void> {
  const environment = parseEnvironment(process.env);
  const enrollmentToken = environment.enrollmentToken;
  delete (environment as { enrollmentToken?: string }).enrollmentToken;
  delete process.env["SITE_AGENT_ENROLLMENT_TOKEN"];

  const logger = createLogger(environment);
  const vault = new CryptoVault(environment.storageKey);
  const store = new SqliteStore(environment.databasePath, vault);
  const runtimeState = new RuntimeState();
  const readiness = new ReadinessService(environment, store, runtimeState);
  const healthServer = new HealthServer(environment, readiness);
  const cloud = new NodeCloudClient(environment);
  const abortController = new AbortController();
  const requestShutdown = (): void => abortController.abort();
  process.once("SIGINT", requestShutdown);
  process.once("SIGTERM", requestShutdown);

  try {
    let identity = store.loadIdentity();
    if (!identity && enrollmentToken) {
      const enrollment = new EnrollmentService(cloud, store, new NodeCertificateVerifier());
      identity = await enrollment.enroll(enrollmentToken);
      logger.info("site_agent_enrolled", {
        identityId: identity.identityId,
        gatewayId: identity.gatewayId,
      });
    }

    await healthServer.listen();
    if (!identity) {
      logger.warn("site_agent_enrollment_required", {
        code: "ENROLLMENT_REQUIRED",
        mode: "preview_only",
      });
      await waitForAbort(abortController.signal);
      return;
    }

    new NodeCertificateVerifier().verify(
      identity.certificatePem,
      identity.caCertificatePem,
      identity.privateKeyPem,
      identity.certificateNotAfter,
      identity.identityId,
      new Date(),
    );
    const signatureVerifier = new CommandSignatureVerifier(environment.commandSigningPublicKeyDer);
    const guard = new CommandGuard(
      signatureVerifier,
      environment.commandClockSkewMs,
      environment.commandMaxTtlMs,
    );
    const executor = new RouterCommandExecutor(
      new PreviewOnlyRouterOsAdapter(),
      environment.captiveOrigin,
    );
    const runtime = new SiteAgentRuntime(
      environment,
      identity,
      cloud,
      store,
      guard,
      executor,
      runtimeState,
      logger,
    );
    await runtime.run(abortController.signal);
  } finally {
    process.off("SIGINT", requestShutdown);
    process.off("SIGTERM", requestShutdown);
    const closePromise = healthServer.close();
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Site-agent graceful shutdown timed out")),
        environment.shutdownTimeoutMs,
      );
      timeout.unref();
    });
    try {
      await Promise.race([closePromise, timeoutPromise]);
    } finally {
      store.close();
    }
  }
}

void run().catch((error: unknown) => {
  const safe = safeErrorFields(error);
  process.stderr.write(
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "fatal",
      service: "wifi-site-agent",
      message: "site_agent_fatal",
      ...safe,
    })}\n`,
  );
  process.exitCode = 1;
});
