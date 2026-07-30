import { applyDecorators } from "@nestjs/common";
import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  getSchemaPath,
} from "@nestjs/swagger";

export class ProblemFieldErrorDto {
  @ApiProperty()
  field!: string;

  @ApiProperty()
  code!: string;
}

export class ProblemDetailsDto {
  @ApiProperty({ format: "uri" })
  type!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  status!: number;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  detail!: string;

  @ApiProperty()
  instance!: string;

  @ApiProperty({ format: "uuid" })
  correlation_id!: string;

  @ApiPropertyOptional({ type: () => [ProblemFieldErrorDto] })
  errors?: readonly ProblemFieldErrorDto[];
}

function problemContent(): Record<string, object> {
  return {
    "application/problem+json": {
      schema: { $ref: getSchemaPath(ProblemDetailsDto) },
    },
  };
}

export function ApiAuthenticatedDomainProblems(): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(ProblemDetailsDto, ProblemFieldErrorDto),
    ApiResponse({
      status: 401,
      description: "Authentication is missing, expired, or invalid.",
      content: problemContent(),
    }),
    ApiResponse({
      status: 403,
      description: "The authenticated actor is not authorized.",
      content: problemContent(),
    }),
    ApiResponse({
      status: 404,
      description: "The requested resource is not visible.",
      content: problemContent(),
    }),
    ApiResponse({
      status: 409,
      description: "The command conflicts with durable resource state.",
      content: problemContent(),
    }),
    ApiResponse({
      status: 413,
      description: "The request exceeds the bounded body envelope.",
      content: problemContent(),
    }),
    ApiResponse({
      status: 415,
      description: "A command did not use application/json.",
      content: problemContent(),
    }),
    ApiResponse({
      status: 422,
      description: "The request is invalid or outside the supported scope.",
      content: problemContent(),
    }),
    ApiResponse({
      status: 429,
      description: "A durable rate limit was reached.",
      content: problemContent(),
    }),
    ApiResponse({
      status: 503,
      description: "A required dependency is temporarily unavailable.",
      content: problemContent(),
    }),
  );
}

export function ApiValidationProblem(): MethodDecorator {
  return applyDecorators(
    ApiExtraModels(ProblemDetailsDto, ProblemFieldErrorDto),
    ApiResponse({
      status: 422,
      description: "The request is invalid or outside the supported scope.",
      content: problemContent(),
    }),
  );
}
