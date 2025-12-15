import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OtpService } from './otp.service';

@Module({
  providers: [OtpService, PrismaService],
  exports: [OtpService],
})
export class OtpModule {}
