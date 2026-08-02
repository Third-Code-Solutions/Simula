import {
  Controller,
  Get,
  HttpStatus,
  Res,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";

import { HealthService, type HealthResponse } from "./health.service";

@ApiTags("health")
@Controller({
  path: "health",
  version: VERSION_NEUTRAL,
})
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("live")
  @ApiOkResponse({
    schema: {
      example: { status: "alive" },
      required: ["status"],
      properties: {
        status: { type: "string", enum: ["alive"] },
      },
    },
  })
  liveness(): HealthResponse {
    return this.healthService.liveness();
  }

  @Get("ready")
  @ApiOkResponse({
    schema: {
      example: { status: "ready" },
      required: ["status"],
      properties: {
        status: { type: "string", enum: ["ready"] },
      },
    },
  })
  @ApiServiceUnavailableResponse({
    schema: {
      example: { status: "not_ready" },
      required: ["status"],
      properties: {
        status: { type: "string", enum: ["not_ready"] },
      },
    },
  })
  async readiness(
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthResponse> {
    const health = await this.healthService.readiness();
    if (health.status !== "ready") {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return health;
  }
}
