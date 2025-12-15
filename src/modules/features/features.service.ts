import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FeaturesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.feature.findMany();
  }

  async findOneById(id: string) {
    return this.prisma.feature.findUnique({
      where: { id },
    });
  }

  async create(data: any) {
    return this.prisma.feature.create({
      data,
    });
  }

  async update(id: string, data: any) {
    return this.prisma.feature.update({
      where: { id },
      data,
    });
  }

  async getFeaturesForPlan(planId: string) {
    return this.prisma.planFeature.findMany({
      where: { planId },
      include: {
        feature: true,
      },
    });
  }

  async addFeatureToPlan(
    planId: string,
    featureId: string,
    enabled?: boolean,
    value?: number,
  ) {
    return this.prisma.planFeature.create({
      data: {
        planId,
        featureId,
        enabled,
        value,
      },
    });
  }

  async getUserFeatures(userId: string) {
    // Get user's subscription
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscriptions: {
          where: {
            status: 'ACTIVE',
          },
          include: {
            plan: {
              include: {
                planFeatures: {
                  include: {
                    feature: true,
                  },
                },
              },
            },
          },
        },
        userFeatureOverrides: {
          include: {
            feature: true,
          },
        },
      },
    });

    if (!user || user.subscriptions.length === 0) {
      return {};
    }

    const activeSubscription = user.subscriptions[0];
    const planFeatures = activeSubscription.plan.planFeatures;
    const userOverrides = user.userFeatureOverrides;

    // Merge plan features with user overrides
    const features: Record<string, any> = {};

    // Add plan features
    for (const planFeature of planFeatures) {
      features[planFeature.feature.key] = {
        enabled: planFeature.enabled,
        value: planFeature.value,
      };
    }

    // Override with user-specific settings
    for (const override of userOverrides) {
      features[override.feature.key] = {
        enabled: override.enabled,
        value: override.value,
      };
    }

    return features;
  }
}
