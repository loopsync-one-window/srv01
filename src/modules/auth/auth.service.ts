import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { EmailService } from '../email/email.service';
import { AuthProvider, UserStatus, AccountType, DeveloperStatus } from '.prisma/client';

@Injectable()
export class AuthService {
  private readonly saltRounds = 10;

  // Make prisma service accessible to the controller
  public readonly prisma: PrismaService;

  constructor(
    prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {
    this.prisma = prisma;
  }

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, refreshTokenHash, ...result } = user;
    return result;
  }

  async login(user: any) {
    const payload = { email: user.email, sub: user.id };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: '7d',
    });

    // Hash and store refresh token
    const hashedRefreshToken = await bcrypt.hash(refreshToken, this.saltRounds);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: hashedRefreshToken },
    });

    const decoded: any = this.jwtService.decode(accessToken);
    const expiresAt = decoded?.exp ? decoded.exp * 1000 : undefined;

    return {
      accessToken,
      refreshToken,
      expiresAt,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        accountType: user.accountType,
        status: user.status,
      },
    };
  }

  async registerWithEmail(fullName: string, email: string, password: string) {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, this.saltRounds);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash: hashedPassword,
        provider: AuthProvider.EMAIL,
        status: UserStatus.PENDING_VERIFICATION,
        accountType: AccountType.VISITOR,
      },
    });

    // Generate and send OTP
    await this.generateAndSendOtp(user.id, user.email);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, refreshTokenHash, ...result } = user;
    return result;
  }

  async registerWithGoogle(googleId: string, email: string, fullName: string) {
    // Check if user already exists with this Google ID
    let user = await this.prisma.user.findUnique({ where: { googleId } });

    if (user) {
      // User already exists with this Google ID
      // Ensure the user has VERIFIED status
      let updatedUser = user;
      if (user.status !== UserStatus.VERIFIED) {
        updatedUser = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            status: UserStatus.VERIFIED,
            // Update provider if it was different
            provider: AuthProvider.GOOGLE,
          },
        });
      }

      return {
        id: updatedUser.id,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        accountType: updatedUser.accountType,
        status: updatedUser.status,
      };
    }

    // Check if user exists with this email
    user = await this.prisma.user.findUnique({ where: { email } });

    if (user) {
      // Link Google account to existing user
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          googleId,
          provider: AuthProvider.GOOGLE,
          // For Google users, we can consider email as verified
          status: UserStatus.VERIFIED,
        },
      });
    } else {
      // Create new user
      user = await this.prisma.user.create({
        data: {
          fullName,
          email,
          googleId,
          provider: AuthProvider.GOOGLE,
          // For Google users, we can consider email as verified
          status: UserStatus.VERIFIED,
          accountType: AccountType.VISITOR,
        },
      });
    }

    // For Google signup, we don't require OTP verification
    // User is considered verified through Google authentication

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, refreshTokenHash, ...result } = user;
    return result;
  }

  async generateAndSendOtp(userId: string, email: string) {
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

    // Send OTP via email
    await this.emailService.sendOtpEmail(email, code);
  }

  async verifyEmailOtp(userId: string, code: string) {
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

    // Update user status
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.VERIFIED,
        accountType: AccountType.VISITOR,
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, refreshTokenHash, ...result } = user;
    return result;
  }

  async refreshAccessToken(refreshToken: string) {
    try {
      const payload: any = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      if (payload.role === 'DEVELOPER') {
        return this.refreshDeveloperToken(refreshToken);
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.refreshTokenHash) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const isRefreshTokenValid = await bcrypt.compare(
        refreshToken,
        user.refreshTokenHash,
      );

      if (!isRefreshTokenValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return this.login(user);
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });

    return { message: 'Successfully logged out' };
  }

  async forceLogout(refreshToken?: string, accessToken?: string) {
    let userId: string | null = null;
    if (refreshToken) {
      try {
        const payload: any = this.jwtService.verify(refreshToken, {
          secret: this.configService.get<string>('jwt.refreshSecret'),
          ignoreExpiration: true,
        });
        userId = payload.sub;
      } catch { }
    }
    if (!userId && accessToken) {
      try {
        const payload: any = this.jwtService.verify(accessToken, {
          secret: this.configService.get<string>('jwt.accessSecret'),
          ignoreExpiration: true,
        });
        userId = payload.sub;
      } catch { }
    }
    if (!userId) {
      return { message: 'No valid token provided' };
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return { message: 'Already logged out' };
    }
    if (user.refreshTokenHash && refreshToken) {
      const match = await bcrypt.compare(refreshToken, user.refreshTokenHash);
      if (!match) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { refreshTokenHash: null },
        });
        return { message: 'Successfully logged out' };
      }
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    return { message: 'Successfully logged out' };
  }

  async verifyAccessTokenAny(accessToken: string) {
    try {
      const payload: any = this.jwtService.verify(accessToken, {
        secret: this.configService.get<string>('jwt.accessSecret'),
        ignoreExpiration: true,
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user) return null;
      const { passwordHash, refreshTokenHash, ...result } = user as any;
      return result;
    } catch {
      return null;
    }
  }

  async sendSupportEmail(data: {
    accessToken: string;
    fullName: string;
    email: string;
    userId: string;
    subject: string;
    category: string;
    description: string;
  }) {
    const verified = await this.verifyAccessTokenAny(data.accessToken);
    const isVerifiedMatch =
      verified && verified.id === data.userId && verified.email === data.email;
    const to = 'ripun@intellaris.co';
    const from = 'noreply@loopsync.cloud';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
        <h2 style="color:#333;">Help & Support Request</h2>
        <div style="background:#f7f7f7; padding:16px; border-radius:8px;">
          <p><strong>Subject:</strong> ${data.subject}</p>
          <p><strong>Category:</strong> ${data.category}</p>
          <p><strong>Description:</strong></p>
          <div style="white-space:pre-wrap; border:1px solid #eee; padding:12px; border-radius:6px;">${data.description}</div>
        </div>
        <h3 style="color:#333;">User</h3>
        <p><strong>Full Name:</strong> ${data.fullName}</p>
        <p><strong>Email:</strong> ${data.email}</p>
        <p><strong>User ID:</strong> ${data.userId}</p>
        <p><strong>Access Token Verified:</strong> ${isVerifiedMatch ? 'Yes' : 'No'}</p>
      </div>
    `;
    await this.emailService.sendMailFrom(
      from,
      to,
      `Help & Support: ${data.subject}`,
      html,
    );
    return { success: true };
  }

  async checkEligibility(email: string): Promise<{ isEligible: boolean }> {
    try {
      // First, check if the email is already in our eligible emails table
      let eligibleEmail = await (this.prisma as any).eligibleEmail.findUnique({
        where: { email },
      });

      // If not found, check if the user exists in our system
      if (!eligibleEmail) {
        const user = await this.prisma.user.findUnique({
          where: { email },
        });

        // If user exists and hasn't used the trial, add them to eligible emails
        // Allow both VISITOR and CUSTOMER account types to be checked for eligibility
        // but only if they haven't already used their trial
        if (user && user.status === 'VERIFIED') {
          try {
            eligibleEmail = await (this.prisma as any).eligibleEmail.create({
              data: {
                email,
                isUsed: false,
              },
            });
          } catch (error) {
            // If creation fails due to unique constraint, fetch the existing record
            if (error.code === 'P2002') {
              // Prisma unique constraint error
              eligibleEmail = await (
                this.prisma as any
              ).eligibleEmail.findUnique({
                where: { email },
              });
            } else {
              throw error; // Re-throw if it's a different error
            }
          }
        }
      }

      // If we have an eligible email record and it hasn't been used, they're eligible
      if (eligibleEmail && !eligibleEmail.isUsed) {
        return { isEligible: true };
      }

      // If no record exists, they're eligible (new user)
      if (!eligibleEmail) {
        return { isEligible: true };
      }

      // Otherwise, they're not eligible
      return { isEligible: false };
    } catch (error) {
      console.error('Error checking eligibility:', error);
      // In case of error, we default to not eligible to be safe
      return { isEligible: false };
    }
  }

  async markEmailAsUsed(email: string): Promise<void> {
    try {
      // Use upsert to handle both cases:
      // 1. If email exists, update isUsed to true
      // 2. If email doesn't exist, create it with isUsed = true
      await (this.prisma as any).eligibleEmail.upsert({
        where: { email },
        update: { isUsed: true },
        create: {
          email,
          isUsed: true,
        },
      });

      console.log('Successfully marked email as used:', email);
    } catch (error) {
      console.error('Error marking email as used:', error);
      throw error;
    }
  }

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    // Find the user by email
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // For security reasons, we don't reveal if the email exists or not
      // But we still return a success message to prevent email enumeration
      return {
        message:
          'If the email exists, a password reset link has been sent to it.',
      };
    }

    // Generate and send OTP for password reset
    await this.generateAndSendOtp(user.id, user.email);

    return { message: 'Password reset code sent successfully' };
  }

  async resetPassword(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Verify the OTP code
    const otpRecord = await this.prisma.emailOtp.findFirst({
      where: {
        userId: user.id,
        code,
        consumed: false,
        expiresAt: {
          gte: new Date(),
        },
      },
    });

    if (!otpRecord) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    // Mark OTP as consumed
    await this.prisma.emailOtp.update({
      where: { id: otpRecord.id },
      data: { consumed: true },
    });

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, this.saltRounds);

    // Update user's password
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashedPassword },
    });


    return { message: 'Password reset successfully' };
  }

  async validateDeveloper(email: string, password: string): Promise<any> {
    const developer = await this.prisma.developer.findUnique({ where: { email } });

    if (!developer || !developer.passwordHash) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, developer.passwordHash);

    if (!isPasswordValid) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, refreshTokenHash, ...result } = developer;
    return result;
  }

  async loginDeveloper(developer: any) {
    const payload = { email: developer.email, sub: developer.id, role: 'DEVELOPER' };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: '7d',
    });

    const hashedRefreshToken = await bcrypt.hash(refreshToken, this.saltRounds);

    await this.prisma.developer.update({
      where: { id: developer.id },
      data: { refreshTokenHash: hashedRefreshToken },
    });

    const decoded: any = this.jwtService.decode(accessToken);
    const expiresAt = decoded?.exp ? decoded.exp * 1000 : undefined;

    return {
      accessToken,
      refreshToken,
      expiresAt,
      developer: {
        id: developer.id,
        fullName: developer.fullName,
        role: developer.role,
        accountStatus: developer.status, // User asked for accountStatus: "active" but schema is status: "ACTIVE"
        verifiedBadge: developer.verifiedBadge,
      },
    };
  }

  async refreshDeveloperToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });

      const developer = await this.prisma.developer.findUnique({
        where: { id: payload.sub },
      });

      if (!developer || !developer.refreshTokenHash) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const isRefreshTokenValid = await bcrypt.compare(
        refreshToken,
        developer.refreshTokenHash,
      );

      if (!isRefreshTokenValid) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const loginRes = await this.loginDeveloper(developer);

      if (developer.status === DeveloperStatus.PENDING_PAYMENT) {
        return {
          ...loginRes,
          paymentRequired: true,
          developerId: developer.id,
          pricing: {
            baseFee: 388.04,
            tax: 69.85,
            verifiedBadgeFee: 399.89,
            currency: 'INR',
          },
        };
      }

      return loginRes;
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
