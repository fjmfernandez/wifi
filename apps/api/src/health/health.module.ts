import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { ReadinessService } from "./readiness.service.js";

@Module({
  controllers: [HealthController],
  providers: [ReadinessService],
  exports: [ReadinessService],
})
export class HealthModule {}
