import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OtpService {
  constructor(private readonly prisma: PrismaService) {}

  async generateOtp(userId: string): Promise<string> {
    // Generate 6-digit OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Set expiration (10 minutes)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    // Save OTP to database
    await this.prisma.emailOtp.create({
      data: {
        userId,
        code,
        expiresAt,
      },
    });

    return code;
  }

  async verifyOtp(userId: string, code: string): Promise<boolean> {
    const otpRecord = await this.prisma.emailOtp.findFirst({
      where: {
        userId,
        code,
        consumed: false,
        expiresAt: {
          gte: new Date(),
        },
      },
    });

    if (!otpRecord) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    // Mark OTP as consumed
    await this.prisma.emailOtp.update({
      where: { id: otpRecord.id },
      data: { consumed: true },
    });

    return true;
  }
}
