import "reflect-metadata";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger as PinoLogger } from "nestjs-pino";
import { AppModule } from "./app.module.js";
import { ProblemDetailsFilter } from "./common/problem-details.filter.js";
import type { AppEnvironment } from "./config/environment.js";

async function bootstrap(): Promise<void> {
  const trustProxy = process.env["TRUST_PROXY"] === "true";
  const adapter = new FastifyAdapter({
    trustProxy,
    bodyLimit: 1_048_576,
    requestTimeout: 15_000,
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
    abortOnError: true,
  });
  const config = app.get(ConfigService<AppEnvironment, true>);

  app.useLogger(app.get(PinoLogger));
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.setGlobalPrefix("api/v1");
  app.enableShutdownHooks();

  await app.register(cors, {
    origin: config.getOrThrow<string[]>("corsOrigins"),
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    hsts:
      config.get("NODE_ENV", { infer: true }) === "production"
        ? { maxAge: 31_536_000, includeSubDomains: false }
        : false,
  });

  if (config.get("SWAGGER_ENABLED", { infer: true })) {
    const swagger = new DocumentBuilder()
      .setTitle("WPass API")
      .setDescription("API de control, portal cautivo, sesiones y aprovisionamiento")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swagger), {
      jsonDocumentUrl: "api/openapi.json",
    });
  }

  const port = config.get("PORT", { infer: true });
  const host = config.get("HOST", { infer: true });
  await app.listen(port, host);
  app.get(PinoLogger).log(`WPass API escuchando en ${host}:${port}`);
}

void bootstrap();
