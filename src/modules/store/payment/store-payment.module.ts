import { Module } from '@nestjs/common';
import { StorePaymentController } from './store-payment.controller';
import { StorePaymentService } from './store-payment.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

@Module({
    imports: [
        PrismaModule,
        ConfigModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => ({
                secret: configService.get<string>('JWT_SECRET') || configService.get<string>('jwt.secret'),
                signOptions: { expiresIn: '60m' },
            }),
            inject: [ConfigService],
        }),
    ],
    controllers: [StorePaymentController],
    providers: [StorePaymentService],
})
export class StorePaymentModule { }
