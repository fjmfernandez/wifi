import { Module } from "@nestjs/common";

import { HealthModule } from "../health/health.module.js";
import { DatabaseService } from "./database.service.js";
import { RedisService } from "./redis.service.js";

@Module({
  imports: [HealthModule],
  providers: [DatabaseService, RedisService],
  exports: [DatabaseService, RedisService],
})
export class InfrastructureModule {}
