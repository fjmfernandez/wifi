import { Controller, Get, Header, HttpException, HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppEnvironment } from "../config/environment.js";
import { ReadinessService } from "./readiness.service.js";

@Controller("health")
export class HealthController {
  constructor(
    private readonly readiness: ReadinessService,
    private readonly config: ConfigService<AppEnvironment, true>,
  ) {}

  @Get("live")
  @Header("Cache-Control", "no-store")
  live(): Record<string, string> {
    return {
      status: "ok",
      service: "wifi-api",
      build: this.config.get("BUILD_SHA", { infer: true }),
    };
  }

  @Get("ready")
  @Header("Cache-Control", "no-store")
  async ready(): Promise<Record<string, unknown>> {
    const checks = await this.readiness.check();
    const unavailable = checks.some((check) => check.status === "down");
    const result = {
      status: unavailable ? "unavailable" : "ready",
      service: "wifi-api",
      checks,
    };

    if (unavailable) {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
