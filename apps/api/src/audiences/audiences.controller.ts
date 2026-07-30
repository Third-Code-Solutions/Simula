import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";

import { CurrentIdentity } from "../auth/current-identity.decorator";
import type { VerifiedIdentity } from "../auth/identity";
import { SupabaseAuthGuard } from "../auth/supabase-auth.guard";
import { ORGANIZATION_GATEWAY } from "../domain/domain.constants";
import { ApiAuthenticatedDomainProblems } from "../domain/problem.dto";
import type { OrganizationGateway } from "../organizations/organization-gateway.port";
import { AudienceDisclosureResponseDto } from "./audience.dto";

@ApiTags("audiences")
@ApiBearerAuth("supabase")
@UseGuards(SupabaseAuthGuard)
@Controller({ path: "audiences", version: "2" })
export class AudiencesController {
  constructor(
    @Inject(ORGANIZATION_GATEWAY)
    private readonly gateway: OrganizationGateway,
  ) {}

  @Get("demo")
  @ApiOperation({ operationId: "getDemoAudience" })
  @ApiOkResponse({ type: AudienceDisclosureResponseDto })
  @ApiAuthenticatedDomainProblems()
  getDemo(
    @CurrentIdentity() identity: VerifiedIdentity,
  ): Promise<AudienceDisclosureResponseDto> {
    return this.gateway.getDemoAudience(identity);
  }
}
