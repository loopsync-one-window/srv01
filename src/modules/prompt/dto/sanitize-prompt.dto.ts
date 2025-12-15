import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class SanitizePromptDto {
  @ApiProperty({ description: 'The exact text the user typed' })
  @IsString()
  rawPrompt: string;

  @ApiProperty({ required: false, description: 'LLM provider identifier' })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiProperty({
    required: false,
    description: 'Logical scope for routing/telemetry',
  })
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  includeMandatoryBlock?: boolean = true;
}
