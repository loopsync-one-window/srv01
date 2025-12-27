import { Body, Controller, Post } from '@nestjs/common';
import { EmailService } from '../email/email.service';

@Controller('support')
export class SupportController {
  constructor(private readonly emailService: EmailService) {}

  @Post('contact')
  async contactSupport(
    @Body('name') name: string,
    @Body('email') email: string,
    @Body('topic') topic: string,
    @Body('message') message: string,
  ) {
    await this.emailService.sendSupportEmail(name, email, topic, message);
    return { success: true, message: 'Support request sent successfully' };
  }
}
