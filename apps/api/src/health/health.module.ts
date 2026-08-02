import { DynamicModule, Module } from "@nestjs/common";

import type { RuntimeEnvironment } from "../config/redis-connection";
import { SimulationQueueModule } from "../queue/simulation-queue.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

@Module({})
export class HealthModule {
  static register(
    environment: RuntimeEnvironment = process.env,
  ): DynamicModule {
    return {
      module: HealthModule,
      imports: [SimulationQueueModule.register(environment)],
      controllers: [HealthController],
      providers: [HealthService],
    };
  }
}
