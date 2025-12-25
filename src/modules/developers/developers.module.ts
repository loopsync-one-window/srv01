
import { Module } from '@nestjs/common';
import { DevelopersController } from './developers.controller';
import { AuthV1Controller } from './auth-v1.controller';
import { DevelopersService } from './developers.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';

import { SettingsController } from './settings.controller';

@Module({
    imports: [PrismaModule, ConfigModule, AuthModule],
    controllers: [DevelopersController, AuthV1Controller, SettingsController],
    providers: [DevelopersService],
    exports: [DevelopersService],
})
export class DevelopersModule { }
