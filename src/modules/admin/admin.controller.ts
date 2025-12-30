import {
  Controller,
  Get,
  Param,
  UseGuards,
  Post,
  Body,
  Delete,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminAuthGuard } from './auth/admin-auth.guard';
import { UsersService } from '../users/users.service';
import { PlansService } from '../plans/plans.service';
import { FeaturesService } from '../features/features.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EmailService } from '../email/email.service';
import { DevelopersService } from '../developers/developers.service';
import { AppsService } from '../store/apps/app.service';

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
    private readonly appsService: AppsService,
  ) { }

  // ... (existing methods) ...

  @UseGuards(AdminAuthGuard)
  @Post('apps/:id/upload-build')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAdminBuild(
    @Param('id') id: string,
    @Body() body: { version: string; platform: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('File is required');
    return this.developersService.uploadBuild(
      id,
      body.version || '1.0.0',
      body.platform || 'windows',
      file,
    );
  }


  @UseGuards(AdminAuthGuard)
  @Get('users')
  async getAllUsers() {
    return this.usersService.findAll();
  }

  @UseGuards(AdminAuthGuard)
  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    return this.usersService.findOneById(id);
  }

  @UseGuards(AdminAuthGuard)
  @Get('subscribed-users')
  async getAllSubscribedUsers() {
    return this.subscriptionsService.getAllSubscribedUsers();
  }

  @UseGuards(AdminAuthGuard)
  @Get('active-subscribers')
  async getActiveSubscribersDetailed() {
    return this.subscriptionsService.getActiveSubscribersDetailed();
  }

  @UseGuards(AdminAuthGuard)
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

  @UseGuards(AdminAuthGuard)
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

  @UseGuards(AdminAuthGuard)
  @Delete('users/:id')
  async deleteUser(@Param('id') id: string) {
    return this.usersService.deleteUserDirectly(id);
  }

  @UseGuards(AdminAuthGuard)
  @Post('users/bulk-delete')
  async deleteUsersBulk(@Body() body: { ids: string[] }) {
    return this.usersService.deleteUsersBulk(body.ids);
  }

  // Developer Admin APIs
  @UseGuards(AdminAuthGuard)
  @Get('developers')
  async getAllDevelopers() {
    return this.developersService.findAll();
  }

  @UseGuards(AdminAuthGuard)
  @Get('developers/:id')
  async getDeveloper(@Param('id') id: string) {
    return this.developersService.findOneById(id);
  }

  @UseGuards(AdminAuthGuard)
  @Delete('developers/:id')
  async deleteDeveloper(@Param('id') id: string) {
    return this.developersService.delete(id);
  }
  // App Review APIs
  @UseGuards(AdminAuthGuard)
  @Get('apps/all')
  async getAllAppsForAdmin() {
    return this.developersService.getAllAppsForAdmin();
  }

  @UseGuards(AdminAuthGuard)
  @Get('apps/review')
  async getAppsForReview() {
    return this.developersService.getAppsForReview();
  }

  @UseGuards(AdminAuthGuard)
  @Get('apps/:id')
  async getAppDetails(@Param('id') id: string) {
    return this.developersService.getAppDetailsForAdmin(id);
  }

  @UseGuards(AdminAuthGuard)
  @Post('apps/:id/approve')
  async approveApp(@Param('id') id: string) {
    return this.developersService.approveApp(id);
  }

  @UseGuards(AdminAuthGuard)
  @Post('apps/:id/reject')
  async rejectApp(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.developersService.rejectApp(id, body.reason);
  }

  @UseGuards(AdminAuthGuard)
  @Post('apps/:id/terminate')
  async terminateApp(@Param('id') id: string) {
    return this.developersService.terminateApp(id);
  }

  @UseGuards(AdminAuthGuard)
  @Post('apps/:id/reopen')
  async reopenApp(@Param('id') id: string) {
    return this.developersService.reopenApp(id);
  }

  @UseGuards(AdminAuthGuard)
  @Post('apps/:id/publish')
  async publishApp(@Param('id') id: string, @Body() body: any) {
    return this.developersService.publishApp(id, body);
  }

  @UseGuards(AdminAuthGuard)
  @Get('apps/:id/history')
  async getAppHistory(@Param('id') id: string) {
    return this.developersService.getAppHistory(id);
  }

  @UseGuards(AdminAuthGuard)
  @Get('flags')
  async getFlaggedApps() {
    return this.appsService.getReports();
  }

  @UseGuards(AdminAuthGuard)
  @Get('purchases')
  async getAllPurchases() {
    return this.developersService.getAllPurchases();
  }

  @UseGuards(AdminAuthGuard)
  @Get('contributions')
  async getAllContributions() {
    return this.developersService.getAllContributions();
  }

  @UseGuards(AdminAuthGuard)
  @Get('apps/:id/reviews')
  async getAppReviews(@Param('id') id: string) {
    return this.developersService.getReviewsForAdmin(id);
  }

  @UseGuards(AdminAuthGuard)
  @Delete('apps/:id/reviews/:reviewId')
  async deleteAppReview(@Param('id') id: string, @Param('reviewId') reviewId: string) {
    return this.developersService.deleteReviewAdmin(id, reviewId);
  }
}
