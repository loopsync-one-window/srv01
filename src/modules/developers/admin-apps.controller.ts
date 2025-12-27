import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DevelopersService } from './developers.service';

@Controller('admin/apps')
@UseGuards(AuthGuard('jwt')) // Ideally add Admin Role Guard here
export class AdminAppsController {
  constructor(private readonly developersService: DevelopersService) {}

  @Get('review')
  async getAppsForReview() {
    return this.developersService.getAppsForReview();
  }

  @Get(':id')
  async getAppDetails(@Param('id') id: string) {
    const app = await this.developersService.getAppDetailsForAdmin(id);
    if (!app) throw new NotFoundException('App not found');
    return app;
  }

  @Post(':id/approve')
  async approveApp(@Param('id') id: string) {
    return this.developersService.approveApp(id);
  }

  @Post(':id/reject')
  async rejectApp(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.developersService.rejectApp(id, body.reason);
  }

  @Post(':id/terminate')
  async terminateApp(@Param('id') id: string) {
    return this.developersService.terminateApp(id);
  }
}
