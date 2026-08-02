import { BullModule } from "@nestjs/bullmq";
import { DynamicModule, Module } from "@nestjs/common";

import {
  parseRedisConnection,
  type RuntimeEnvironment,
} from "../config/redis-connection";
import { BullMqSimulationQueue } from "./bullmq-simulation-queue";
import {
  SIMULATION_QUEUE_NAME,
  SIMULATION_QUEUE_PORT,
} from "./queue.constants";
import { UnavailableSimulationQueue } from "./unavailable-simulation-queue";

@Module({})
export class SimulationQueueModule {
  static register(
    environment: RuntimeEnvironment = process.env,
  ): DynamicModule {
    const connection = parseRedisConnection(environment);

    if (connection === null) {
      return {
        global: true,
        module: SimulationQueueModule,
        providers: [
          {
            provide: SIMULATION_QUEUE_PORT,
            useClass: UnavailableSimulationQueue,
          },
        ],
        exports: [SIMULATION_QUEUE_PORT],
      };
    }

    return {
      global: true,
      module: SimulationQueueModule,
      imports: [
        BullModule.forRoot({
          connection,
          prefix: "simula:v2",
        }),
        BullModule.registerQueue({
          name: SIMULATION_QUEUE_NAME,
        }),
      ],
      providers: [
        {
          provide: SIMULATION_QUEUE_PORT,
          useClass: BullMqSimulationQueue,
        },
      ],
      exports: [SIMULATION_QUEUE_PORT],
    };
  }
}
