import { PrismaClient } from '@prisma/client';

declare module './prisma.service' {
  interface PrismaService extends PrismaClient {
    // All models should be automatically available through PrismaClient
  }
}