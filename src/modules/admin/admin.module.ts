import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { PlansService } from '../plans/plans.service';
import { FeaturesService } from '../features/features.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsersModule } from '../users/users.module';
import { BillingModule } from '../billing/billing.module';
import { PlansModule } from '../plans/plans.module';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [UsersModule, BillingModule, PlansModule, AuthModule, EmailModule],
  controllers: [AdminController],
  providers: [
    PrismaService,
    UsersService,
    PlansService,
    FeaturesService,
    SubscriptionsService,
  ],
})
export class AdminModule {}
