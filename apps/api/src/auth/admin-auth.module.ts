import { Module } from "@nestjs/common";

import { InfrastructureModule } from "../infrastructure/infrastructure.module.js";
import { AdminAuthController } from "./admin-auth.controller.js";
import { AdminAuthService } from "./admin-auth.service.js";

@Module({
  imports: [InfrastructureModule],
  controllers: [AdminAuthController],
  providers: [AdminAuthService],
  exports: [AdminAuthService],
})
export class AdminAuthModule {}
