import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validationSchema } from './config/validation';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OtpModule } from './modules/otp/otp.module';
import { PlansModule } from './modules/plans/plans.module';
import { FeaturesModule } from './modules/features/features.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { BillingModule } from './modules/billing/billing.module';
import { HealthModule } from './modules/health/health.module';
import { AdminModule } from './modules/admin/admin.module';
import { EmailModule } from './modules/email/email.module';
import { PaymentMethodsModule } from './modules/payment-methods/payment-methods.module';
import { PromptModule } from './modules/prompt/prompt.module';
import { UpgradeModule } from './modules/upgrade/upgrade.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { SupportModule } from './modules/support/support.module';
import { AcquireModule } from './modules/acquire/acquire.module';
import { DevelopersModule } from './modules/developers/developers.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
      load: [configuration],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    OtpModule,
    PlansModule,
    FeaturesModule,
    SubscriptionsModule,
    BillingModule,
    HealthModule,
    AdminModule,
    EmailModule,
    PaymentMethodsModule,
    PromptModule,
    UpgradeModule,
    InvoicesModule,
    SupportModule,
    AcquireModule,
    DevelopersModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
