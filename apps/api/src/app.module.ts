import { DynamicModule, Module } from "@nestjs/common";

import type { RuntimeEnvironment } from "./config/redis-connection";
import { DomainModule } from "./domain/domain.module";
import { HealthModule } from "./health/health.module";

@Module({})
export class AppModule {
  static register(
    environment: RuntimeEnvironment = process.env,
  ): DynamicModule {
    return {
      module: AppModule,
      imports: [
        DomainModule.register(environment),
        HealthModule.register(environment),
      ],
    };
  }
}
