import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { AdminOperationsModule } from "./admin/admin-operations.module.js";
import { AdminAuthModule } from "./auth/admin-auth.module.js";
import { CaptiveModule } from "./captive/captive.module.js";
import { RequestContextMiddleware } from "./common/request-context.js";
import { parseEnvironment } from "./config/environment.js";
import { HealthModule } from "./health/health.module.js";
import { InfrastructureModule } from "./infrastructure/infrastructure.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: parseEnvironment,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env["LOG_LEVEL"] ?? "info",
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "res.headers.set-cookie",
            "password",
            "token",
            "voucher",
            "pin",
          ],
          censor: "[REDACTED]",
        },
        serializers: {
          req: (request) => ({ method: request.method, url: request.url?.split("?")[0] }),
          res: (response) => ({ statusCode: response.statusCode }),
        },
      },
    }),
    AdminAuthModule,
    AdminOperationsModule,
    CaptiveModule,
    HealthModule,
    InfrastructureModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes("{*splat}");
  }
}
