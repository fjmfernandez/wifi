import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AppEnvironment } from "../config/environment.js";
import { InfrastructureModule } from "../infrastructure/infrastructure.module.js";
import { CaptiveController } from "./captive.controller.js";
import { CAPTIVE_REPOSITORY } from "./captive.repository.js";
import { CaptiveService } from "./captive.service.js";
import { DemoCaptiveRepository } from "./demo-captive.repository.js";
import { PrismaCaptiveRepository } from "./prisma-captive.repository.js";

@Module({
  imports: [InfrastructureModule],
  controllers: [CaptiveController],
  providers: [
    CaptiveService,
    DemoCaptiveRepository,
    PrismaCaptiveRepository,
    {
      provide: CAPTIVE_REPOSITORY,
      inject: [ConfigService, DemoCaptiveRepository, PrismaCaptiveRepository],
      useFactory: (
        config: ConfigService<AppEnvironment, true>,
        demo: DemoCaptiveRepository,
        production: PrismaCaptiveRepository,
      ) => (config.get("DEMO_MODE", { infer: true }) ? demo : production),
    },
  ],
})
export class CaptiveModule {}
