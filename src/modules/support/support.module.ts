import { Module } from '@nestjs/common';
import { SupportController } from './support.controller';
import { EmailModule } from '../email/email.module';

@Module({
    imports: [EmailModule],
    controllers: [SupportController],
})
export class SupportModule { }
