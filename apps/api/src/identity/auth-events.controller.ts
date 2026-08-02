import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";

import {
  type AuthenticatedRequest,
  SupabaseAuthGuard,
} from "../auth/supabase-auth.guard";
import { ApiAuthenticatedDomainProblems } from "../domain/problem.dto";
import { AuthEventCreateDto, AuthEventResponseDto } from "./identity.dto";

@ApiTags("identity")
@ApiBearerAuth("supabase")
@UseGuards(SupabaseAuthGuard)
@Controller({ path: "auth-events", version: "2" })
export class AuthEventsController {
  @Post()
  @HttpCode(201)
  @ApiOperation({ operationId: "createAuthEvent" })
  @ApiCreatedResponse({ type: AuthEventResponseDto })
  @ApiOkResponse({ type: AuthEventResponseDto })
  @ApiAuthenticatedDomainProblems()
  create(
    @Body() _body: AuthEventCreateDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): AuthEventResponseDto {
    const recorded = request.simulaSignInAuditRecorded === true;
    response.status(recorded ? 201 : 200);
    return { kind: "sign_in", recorded };
  }
}
