import { Module } from '@nestjs/common';
import { AppsController } from './apps/app.controller';
import { AppsService } from './apps/app.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { StorePaymentModule } from './payment/store-payment.module';

@Module({
    imports: [PrismaModule, ConfigModule, StorePaymentModule],
    controllers: [AppsController],
    providers: [AppsService],
    exports: [AppsService],
})
export class StoreModule { }
// Trigger rebuild for payment module registration
