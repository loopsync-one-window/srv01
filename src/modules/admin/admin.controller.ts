import { Controller, Get, Param, UseGuards, Post, Body, Delete } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from '../users/users.service';
import { PlansService } from '../plans/plans.service';
import { FeaturesService } from '../features/features.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EmailService } from '../email/email.service';
import { DevelopersService } from '../developers/developers.service';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly usersService: UsersService,
    private readonly plansService: PlansService,
    private readonly featuresService: FeaturesService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly emailService: EmailService,
    private readonly developersService: DevelopersService,
  ) { }

  @UseGuards(AuthGuard('jwt'))
  @Get('users')
  async getAllUsers() {
    return this.usersService.findAll();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    return this.usersService.findOneById(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('subscribed-users')
  async getAllSubscribedUsers() {
    return this.subscriptionsService.getAllSubscribedUsers();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('active-subscribers')
  async getActiveSubscribersDetailed() {
    return this.subscriptionsService.getActiveSubscribersDetailed();
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('notify-all')
  async notifyAll(@Body() body: any) {
    const { title, description } = body || {};
    if (!title || !description) {
      return { success: false, message: 'Title and description are required' };
    }
    const users = await this.usersService.findAll();
    const from = 'noreply@loopsync.cloud';
    const subject = `Notification: ${title}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
        <h2 style="color:#333;">${title}</h2>
        <div style="white-space:pre-wrap; border:1px solid #eee; padding:12px; border-radius:6px;">${description}</div>
      </div>
    `;
    let sent = 0;
    for (const u of users) {
      if (u.email) {
        try {
          await this.emailService.sendMailFrom(from, u.email, subject, html);
          sent++;
        } catch { }
      }
    }
    return { success: true, sent, total: users.length };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('notify-user')
  async notifyUser(@Body() body: any) {
    const { userId, title, description } = body || {};
    if (!userId || !title || !description) {
      return {
        success: false,
        message: 'userId, title and description are required',
      };
    }
    const user = await this.usersService.findOneById(userId);
    if (!user || !user.email) {
      return { success: false, message: 'User not found or missing email' };
    }
    const from = 'noreply@loopsync.cloud';
    const subject = `Notification: ${title}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
        <h2 style="color:#333;">${title}</h2>
        <div style="white-space:pre-wrap; border:1px solid #eee; padding:12px; border-radius:6px;">${description}</div>
        <hr />
        <p style="color:#666;">Sent to: ${user.fullName || ''} (${user.email})</p>
      </div>
    `;
    await this.emailService.sendMailFrom(from, user.email, subject, html);
    return { success: true };
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('users/:id')
  async deleteUser(@Param('id') id: string) {
    return this.usersService.deleteUserDirectly(id);
  }

  // Developer Admin APIs
  @UseGuards(AuthGuard('jwt'))
  @Get('developers')
  async getAllDevelopers() {
    return this.developersService.findAll();
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('developers/:id')
  async getDeveloper(@Param('id') id: string) {
    return this.developersService.findOneById(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('developers/:id')
  async deleteDeveloper(@Param('id') id: string) {
    return this.developersService.delete(id);
  }
}
