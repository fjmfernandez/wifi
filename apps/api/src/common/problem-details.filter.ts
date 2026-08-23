import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { currentRequestContext } from "./request-context.js";

interface HttpExceptionBody {
  error?: string;
  message?: string | string[];
  statusCode?: number;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<FastifyReply>();
    const request = context.getRequest<FastifyRequest>();
    const correlationId = currentRequestContext()?.correlationId ?? "unavailable";

    const isValidationError = exception instanceof ZodError;
    const status = isValidationError
      ? HttpStatus.BAD_REQUEST
      : exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : undefined;
    const body: HttpExceptionBody = typeof raw === "object" && raw !== null ? raw : {};
    const messages = Array.isArray(body.message) ? body.message : undefined;
    const validationErrors = isValidationError
      ? exception.issues.reduce<Record<string, string[]>>((errors, issue) => {
          const field = issue.path.length > 0 ? issue.path.join(".") : "request";
          (errors[field] ??= []).push(issue.message);
          return errors;
        }, {})
      : undefined;

    if (status >= 500) {
      this.logger.error({
        correlationId,
        method: request.method,
        path: request.url.split("?")[0],
        exception: exception instanceof Error ? exception.message : "unknown_exception",
      });
    }

    void response.status(status).send({
      type: `https://wpass.es/problems/http-${status}`,
      title: isValidationError ? "Bad Request" : (body.error ?? HttpStatus[status] ?? "Error"),
      status,
      detail:
        status >= 500
          ? "Se produjo un error interno"
          : isValidationError
            ? "La solicitud no cumple el formato esperado"
            : typeof body.message === "string"
              ? body.message
              : undefined,
      instance: request.url.split("?")[0],
      correlationId,
      errors: validationErrors ?? (messages ? { request: messages } : undefined),
    });
  }
}
