import { Controller, Get, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";

import { CurrentIdentity } from "../auth/current-identity.decorator";
import type { VerifiedIdentity } from "../auth/identity";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { ApiAuthenticatedDomainProblems } from "../domain/problem.dto";
import { MeResponseDto } from "./identity.dto";

@ApiTags("identity")
@ApiBearerAuth("supabase")
@UseGuards(SupabaseAuthGuard)
@Controller({
  path: "me",
  version: "2",
})
export class IdentityController {
  @Get()
  @ApiOperation({ operationId: "getCurrentIdentity" })
  @ApiOkResponse({ type: MeResponseDto })
  @ApiAuthenticatedDomainProblems()
  current(@CurrentIdentity() identity: VerifiedIdentity): MeResponseDto {
    return { user_id: identity.userId };
  }
}
