import { Module } from '@nestjs/common';
import { DevelopersController } from './developers.controller';
import { AuthV1Controller } from './auth-v1.controller';
import { DevelopersService } from './developers.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';

import { SettingsController } from './settings.controller';

import { BankingController } from './banking.controller';

import { RevenueController } from './revenue.controller';
import { AnalyticsController } from './analytics.controller';
import { OverviewController } from './overview.controller';
import { AppsController } from './apps.controller';
import { AdminAppsController } from './admin-apps.controller';

@Module({
  imports: [PrismaModule, ConfigModule, AuthModule],
  controllers: [
    DevelopersController,
    AuthV1Controller,
    SettingsController,
    BankingController,
    RevenueController,
    AnalyticsController,
    OverviewController,
    AppsController,
    AdminAppsController,
  ],
  providers: [DevelopersService],
  exports: [DevelopersService],
})
export class DevelopersModule {}
