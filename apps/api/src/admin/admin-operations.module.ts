import { Module } from "@nestjs/common";

import { AdminAuthModule } from "../auth/admin-auth.module.js";
import { InfrastructureModule } from "../infrastructure/infrastructure.module.js";
import { AdminOperationsController } from "./admin-operations.controller.js";
import { AdminOperationsService } from "./admin-operations.service.js";

@Module({
  imports: [AdminAuthModule, InfrastructureModule],
  controllers: [AdminOperationsController],
  providers: [AdminOperationsService],
})
export class AdminOperationsModule {}
