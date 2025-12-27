import { Module } from '@nestjs/common';
import { AcquireController } from './acquire.controller';
import { AcquireService } from './acquire.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [AcquireController],
  providers: [AcquireService],
})
export class AcquireModule {}
