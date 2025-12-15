import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailOtpDto {
  @ApiProperty({ example: 'clx5j4a8p0000i7idbx2k6p3v' })
  @IsNotEmpty()
  @IsString()
  userId: string;

  @ApiProperty({ example: '123456' })
  @IsNotEmpty()
  @IsString()
  code: string;
}
