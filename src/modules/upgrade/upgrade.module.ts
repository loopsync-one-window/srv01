import { Module } from '@nestjs/common';
import { UpgradeService } from './upgrade.service';
import { UpgradeController } from './upgrade.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { PlansModule } from '../plans/plans.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [PrismaModule, PlansModule, BillingModule],
  controllers: [UpgradeController],
  providers: [UpgradeService],
})
export class UpgradeModule {}
