import { ApiProperty } from "@nestjs/swagger";
import { Equals } from "class-validator";

export class MeResponseDto {
  @ApiProperty({ format: "uuid" })
  user_id!: string;
}

export class AuthEventCreateDto {
  @ApiProperty({ enum: ["sign_in"] })
  @Equals("sign_in")
  kind!: "sign_in";
}

export class AuthEventResponseDto {
  @ApiProperty({ enum: ["sign_in"] })
  kind!: "sign_in";

  @ApiProperty()
  recorded!: boolean;
}
