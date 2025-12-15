import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.plan.findMany({
      include: {
        planFeatures: {
          include: {
            feature: true,
          },
        },
      },
    });
  }

  async findOneById(id: string) {
    return this.prisma.plan.findUnique({
      where: { id },
      include: {
        planFeatures: {
          include: {
            feature: true,
          },
        },
      },
    });
  }

  async findOneByCode(code: string) {
    // Try exact match first
    let plan = await this.prisma.plan.findUnique({
      where: { code },
      include: {
        planFeatures: {
          include: {
            feature: true,
          },
        },
      },
    });

    // If not found, try case-insensitive search
    if (!plan) {
      plan = await this.prisma.plan.findFirst({
        where: {
          code: {
            mode: 'insensitive',
            equals: code,
          },
        },
        include: {
          planFeatures: {
            include: {
              feature: true,
            },
          },
        },
      });
    }

    return plan;
  }

  async create(data: any) {
    return this.prisma.plan.create({
      data,
    });
  }

  async update(id: string, data: any) {
    return this.prisma.plan.update({
      where: { id },
      data,
    });
  }
}
