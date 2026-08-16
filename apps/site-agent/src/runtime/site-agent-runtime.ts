import { randomUUID } from "node:crypto";

import type { AgentCloudPort } from "../cloud/cloud-port.js";
import type { AgentEnvironment } from "../config/environment.js";
import {
  AGENT_PROTOCOL_VERSION,
  AGENT_VERSION,
  type AgentIdentityMaterial,
  type AgentOutboxEvent,
  type CommandOutcome,
  type SignedAgentCommand,
} from "../contracts.js";
import type { AgentLogger } from "../logging/logger.js";
import { safeErrorFields } from "../logging/logger.js";
import type { CommandGuard } from "../commands/command-guard.js";
import type { RouterCommandExecutor } from "../router/command-executor.js";
import type { SqliteStore } from "../storage/sqlite-store.js";
import { abortableDelay, ExponentialBackoff } from "./backoff.js";
import type { RuntimeState } from "./runtime-state.js";

type RuntimeEnvironment = Pick<
  AgentEnvironment,
  | "pollIntervalMs"
  | "heartbeatIntervalMs"
  | "maxCommandsPerPoll"
  | "backoffBaseMs"
  | "backoffMaxMs"
  | "buildSha"
>;

export class SiteAgentRuntime {
  readonly #backoff: ExponentialBackoff;

  constructor(
    private readonly environment: RuntimeEnvironment,
    private readonly identity: AgentIdentityMaterial,
    private readonly cloud: AgentCloudPort,
    private readonly store: SqliteStore,
    private readonly guard: CommandGuard,
    private readonly executor: RouterCommandExecutor,
    private readonly state: RuntimeState,
    private readonly logger: AgentLogger,
    private readonly now: () => Date = () => new Date(),
    random: () => number = Math.random,
  ) {
    this.#backoff = new ExponentialBackoff(
      environment.backoffBaseMs,
      environment.backoffMaxMs,
      random,
    );
  }

  async run(signal: AbortSignal): Promise<void> {
    this.state.markStarted();
    this.logger.info("site_agent_started", { mode: "preview_only" });
    try {
      while (!signal.aborted) {
        try {
          await this.syncOnce();
          this.#backoff.reset();
          await abortableDelay(this.environment.pollIntervalMs, signal);
        } catch (error) {
          const waitMs = this.#backoff.next();
          this.logger.warn("site_agent_sync_failed", {
            ...safeErrorFields(error),
            retryInMs: waitMs,
          });
          await abortableDelay(waitMs, signal);
        }
      }
    } finally {
      this.state.markStopped();
      this.logger.info("site_agent_stopped");
    }
  }

  async syncOnce(): Promise<void> {
    this.#enqueueHeartbeat();
    await this.#processPendingCommands();
    await this.#flushOutbox();

    const afterSequence = this.store.getLastCommandSequence();
    if (afterSequence === undefined) {
      throw new Error("Site agent identity disappeared from durable storage");
    }
    const lease = await this.cloud.leaseCommands(
      this.identity,
      afterSequence,
      this.environment.maxCommandsPerPoll,
    );
    if (lease.commands.length > this.environment.maxCommandsPerPoll) {
      throw new Error("Cloud returned more commands than the signed lease requested");
    }
    const orderedCommands = [...lease.commands].sort(
      (left, right) => left.sequence - right.sequence,
    );
    for (const command of orderedCommands) {
      const guarded = this.guard.guard(command, this.identity);
      const status = this.store.acceptCommand(
        guarded.command,
        guarded.digest,
        this.now().toISOString(),
      );
      this.logger.debug("site_agent_command_received", {
        commandId: command.id,
        commandType: command.type,
        commandSequence: command.sequence,
        duplicate: status === "duplicate",
      });
    }

    await this.#processPendingCommands();
    await this.#flushOutbox();
    this.state.markCloudSuccess(this.now());
  }

  #enqueueHeartbeat(): void {
    const at = this.now();
    const counts = this.store.counts();
    const event = this.#event("agent.heartbeat", at, {
      agentVersion: AGENT_VERSION,
      buildSha: this.environment.buildSha,
      mode: "preview_only",
      applyStatus: "BLOCKED_BY_LAB_VALIDATION",
      pendingCommands: counts.pendingCommands,
      pendingOutboxEvents: counts.pendingOutboxEvents,
    });
    const dueBefore = new Date(at.getTime() - this.environment.heartbeatIntervalMs).toISOString();
    this.store.enqueueHeartbeatIfDue(event, dueBefore);
  }

  async #processPendingCommands(): Promise<void> {
    while (true) {
      const stored = this.store.nextPendingCommand();
      if (!stored) {
        return;
      }
      if (stored.state === "accepted") {
        this.store.markCommandExecuting(stored.command.id, this.now().toISOString());
      }
      const expired = Date.parse(stored.command.expiresAt) <= this.now().getTime();
      let outcome: CommandOutcome;
      try {
        outcome = await this.executor.execute(stored.command, expired);
      } catch (error) {
        this.logger.warn("site_agent_command_execution_failed", {
          commandId: stored.command.id,
          commandType: stored.command.type,
          ...safeErrorFields(error),
        });
        outcome = this.#failedOutcome(stored.command);
      }
      const event = this.#event("agent.command-result", new Date(outcome.completedAt), { outcome });
      this.store.completeCommand(stored.command.id, outcome, event, outcome.completedAt);
    }
  }

  async #flushOutbox(): Promise<void> {
    while (true) {
      const pending = this.store.pendingOutbox(this.now().toISOString(), 25);
      if (pending.length === 0) {
        return;
      }
      for (const item of pending) {
        try {
          await this.cloud.publishEvent(this.identity, item.event);
          const deliveredAt = this.now();
          this.store.markOutboxDelivered(item.event.id, deliveredAt.toISOString());
          this.state.markCloudSuccess(deliveredAt);
        } catch (error) {
          const exponent = Math.min(item.attempts, 20);
          const delayMs = Math.min(
            this.environment.backoffMaxMs,
            this.environment.backoffBaseMs * 2 ** exponent,
          );
          const availableAt = new Date(this.now().getTime() + delayMs).toISOString();
          const fields = safeErrorFields(error);
          const code =
            typeof fields["errorCode"] === "string"
              ? fields["errorCode"]
              : "OUTBOX_DELIVERY_FAILED";
          this.store.deferOutbox(item.event.id, code, availableAt);
          throw error;
        }
      }
    }
  }

  #event(
    type: AgentOutboxEvent["type"],
    occurredAt: Date,
    payload: Readonly<Record<string, unknown>>,
  ): AgentOutboxEvent {
    return {
      id: randomUUID(),
      protocolVersion: AGENT_PROTOCOL_VERSION,
      identityId: this.identity.identityId,
      tenantId: this.identity.tenantId,
      gatewayId: this.identity.gatewayId,
      type,
      occurredAt: occurredAt.toISOString(),
      payload,
    };
  }

  #failedOutcome(command: SignedAgentCommand): CommandOutcome {
    return {
      commandId: command.id,
      commandSequence: command.sequence,
      status: "failed",
      code: "ROUTER_EXECUTION_FAILED",
      completedAt: this.now().toISOString(),
      evidence: {},
    };
  }
}
