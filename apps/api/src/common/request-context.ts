import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

export interface RequestContext {
  correlationId: string;
  tenantId?: string;
  actorId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function currentRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: FastifyRequest["raw"], response: FastifyReply["raw"], next: () => void): void {
    const header = request.headers["x-correlation-id"];
    const correlationId =
      typeof header === "string" && /^[a-zA-Z0-9._:-]{8,128}$/.test(header) ? header : randomUUID();

    response.setHeader("x-correlation-id", correlationId);
    storage.run({ correlationId }, next);
  }
}
