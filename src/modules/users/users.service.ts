import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async findOneByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, refreshTokenHash, ...result } = user;
      return result;
    }

    return null;
  }

  async findOneById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, refreshTokenHash, ...result } = user;
      return result;
    }

    return null;
  }

  async findAll() {
    const users = await this.prisma.user.findMany();

    // Remove sensitive information
    return users.map((user: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, refreshTokenHash, ...result } = user;
      return result;
    });
  }

  async findOneWithSubscriptions(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscriptions: true,
      },
    });

    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, refreshTokenHash, ...result } = user;
      return result;
    }

    return null;
  }

  async updateAccountType(userId: string, accountType: any) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { accountType },
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, refreshTokenHash, ...result } = user;
    return result;
  }

  async searchUsers(searchTerm: string) {
    // Search by email or ID
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: searchTerm, mode: 'insensitive' } },
          { id: searchTerm },
        ],
      },
    });

    // Remove sensitive information
    return users.map((user: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { passwordHash, refreshTokenHash, ...result } = user;
      return result;
    });
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const activeSubscription = await this.prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { plan: true },
    });

    return {
      fullName: user.fullName,
      email: user.email,
      memberSince: user.createdAt,
      termsAccepted: true,
      activePlan: activeSubscription ? activeSubscription.plan.name : null,
    };
  }

  async getOnboardStatus(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return { userId, onboard: !!(user as any).onboard };
  }

  async updateOnboardStatus(userId: string, onboard: boolean) {
    if (typeof onboard !== 'boolean') {
      throw new BadRequestException('onboard must be boolean');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await (this.prisma as any).user.update({
      where: { id: userId },
      data: { onboard },
    });
    return {
      userId,
      onboard,
      message: 'Onboard status updated successfully.',
    };
  }

  async getTrialNotifyStatus(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return { userId, trialNotify: !!(user as any).trialNotify };
  }

  async updateTrialNotifyStatus(userId: string, trialNotify: boolean) {
    if (typeof trialNotify !== 'boolean') {
      throw new BadRequestException('trialNotify must be boolean');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await (this.prisma as any).user.update({
      where: { id: userId },
      data: { trialNotify },
    });
    return {
      userId,
      trialNotify,
      message: 'Trial notify status updated successfully.',
    };
  }

  async updatePassword(userId: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { success: true };
  }

  async requestDeletionOtp(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.authService.generateAndSendOtp(user.id, user.email);
    return { success: true, message: 'Deletion OTP sent' };
  }

  async confirmDeletion(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const otpRecord = await (this.prisma as any).emailOtp.findFirst({
      where: {
        userId,
        code,
        consumed: false,
        expiresAt: { gte: new Date() },
      },
    });

    if (!otpRecord) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    const existingEligible = await (
      this.prisma as any
    ).eligibleEmail.findUnique({
      where: { email: user.email },
    });

    await this.prisma.$transaction([
      (this.prisma as any).subscription.deleteMany({ where: { userId } }),
      (this.prisma as any).emailOtp.deleteMany({ where: { userId } }),
      (this.prisma as any).userFeatureOverride.deleteMany({
        where: { userId },
      }),
      (this.prisma as any).paymentMethod.deleteMany({ where: { userId } }),
      (this.prisma as any).billingAddress.deleteMany({ where: { userId } }),
      (this.prisma as any).user.delete({ where: { id: userId } }),
    ]);

    await (this.prisma as any).eligibleEmail.upsert({
      where: { email: user.email },
      update: { isUsed: existingEligible ? existingEligible.isUsed : false },
      create: { email: user.email, isUsed: false },
    });

    return { success: true, message: 'Account deleted' };
  }

  private async ensureFeature(key: string, label: string) {
    let feature = await (this.prisma as any).feature.findUnique({
      where: { key },
    });
    if (!feature) {
      feature = await (this.prisma as any).feature.create({
        data: { key, label, dataType: 'BOOLEAN' },
      });
    }
    return feature;
  }

  private async getPreference(
    userId: string,
    key: string,
    defaultValue: boolean,
  ) {
    const feature = await this.ensureFeature(key, key.replace(/_/g, ' '));
    const override = await (this.prisma as any).userFeatureOverride.findUnique({
      where: { userId_featureId: { userId, featureId: feature.id } },
    });
    if (override && typeof override.enabled === 'boolean')
      return override.enabled;
    return defaultValue;
  }

  async getPreferences(userId: string) {
    const notifications = await this.getPreference(
      userId,
      'NOTIFICATIONS',
      true,
    );
    const musicExperience = await this.getPreference(
      userId,
      'MUSIC_EXPERIENCE',
      true,
    );
    const emergencyLockdown = await this.getPreference(
      userId,
      'EMERGENCY_LOCKDOWN',
      false,
    );
    const stabilityMode = await this.getPreference(
      userId,
      'STABILITY_MODE',
      true,
    );
    return { notifications, musicExperience, emergencyLockdown, stabilityMode };
  }

  async getNotifications(userId: string) {
    return this.getPreference(userId, 'NOTIFICATIONS', true);
  }

  async getMusicExperience(userId: string) {
    return this.getPreference(userId, 'MUSIC_EXPERIENCE', true);
  }

  async getEmergencyLockdown(userId: string) {
    return this.getPreference(userId, 'EMERGENCY_LOCKDOWN', false);
  }

  async getStabilityMode(userId: string) {
    return this.getPreference(userId, 'STABILITY_MODE', true);
  }

  private async setPreference(
    userId: string,
    key: string,
    label: string,
    value: boolean,
  ) {
    const feature = await this.ensureFeature(key, label);
    const existing = await (this.prisma as any).userFeatureOverride.findUnique({
      where: { userId_featureId: { userId, featureId: feature.id } },
    });
    if (existing) {
      await (this.prisma as any).userFeatureOverride.update({
        where: { id: existing.id },
        data: { enabled: value },
      });
    } else {
      await (this.prisma as any).userFeatureOverride.create({
        data: { userId, featureId: feature.id, enabled: value },
      });
    }
    return { success: true };
  }

  async setNotifications(userId: string, value: boolean) {
    return this.setPreference(userId, 'NOTIFICATIONS', 'Notifications', value);
  }

  async setMusicExperience(userId: string, value: boolean) {
    return this.setPreference(
      userId,
      'MUSIC_EXPERIENCE',
      'Music Experience',
      value,
    );
  }

  async setEmergencyLockdown(userId: string, value: boolean) {
    return this.setPreference(
      userId,
      'EMERGENCY_LOCKDOWN',
      'Emergency Lockdown',
      value,
    );
  }

  async setStabilityMode(userId: string, value: boolean) {
    return this.setPreference(
      userId,
      'STABILITY_MODE',
      'Stability Mode',
      value,
    );
  }

  async getModels(userId: string) {
    const computeMax = await this.getPreference(
      userId,
      'MODEL_COMPUTE_MAX',
      false,
    );
    const r3Advanced = await this.getPreference(
      userId,
      'MODEL_R3_ADVANCED',
      false,
    );
    const visionPro = await this.getPreference(
      userId,
      'MODEL_VISION_PRO',
      false,
    );
    return { computeMax, r3Advanced, visionPro };
  }

  async setComputeMax(userId: string, value: boolean) {
    return this.setPreference(
      userId,
      'MODEL_COMPUTE_MAX',
      'Model Compute-Max',
      value,
    );
  }

  async setR3Advanced(userId: string, value: boolean) {
    return this.setPreference(
      userId,
      'MODEL_R3_ADVANCED',
      'Model R3 Advanced',
      value,
    );
  }

  async setVisionPro(userId: string, value: boolean) {
    return this.setPreference(
      userId,
      'MODEL_VISION_PRO',
      'Model Vision Pro',
      value,
    );
  }
  async deleteUserDirectly(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingEligible = await (
      this.prisma as any
    ).eligibleEmail.findUnique({
      where: { email: user.email },
    });

    await this.prisma.$transaction([
      (this.prisma as any).subscription.deleteMany({ where: { userId } }),
      (this.prisma as any).emailOtp.deleteMany({ where: { userId } }),
      (this.prisma as any).userFeatureOverride.deleteMany({
        where: { userId },
      }),
      (this.prisma as any).paymentMethod.deleteMany({ where: { userId } }),
      (this.prisma as any).billingAddress.deleteMany({ where: { userId } }),
      (this.prisma as any).invoice.deleteMany({ where: { userId } }),
      (this.prisma as any).user.delete({ where: { id: userId } }),
    ]);

    await (this.prisma as any).eligibleEmail.upsert({
      where: { email: user.email },
      update: { isUsed: existingEligible ? existingEligible.isUsed : false },
      create: { email: user.email, isUsed: false },
    });

    return { success: true, message: 'Account deleted' };
  }

  async deleteUsersBulk(userIds: string[]) {
    const results = [];
    for (const id of userIds) {
      try {
        await this.deleteUserDirectly(id);
        results.push({ id, status: 'success' });
      } catch (error) {
        results.push({ id, status: 'failed', error: error.message });
      }
    }
    return { success: true, results };
  }
}
