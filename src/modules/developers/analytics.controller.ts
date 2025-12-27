import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DevelopersService } from './developers.service';

@Controller('api/v1/analytics')
@UseGuards(AuthGuard('jwt'))
export class AnalyticsController {
  constructor(private readonly developersService: DevelopersService) {}

  @Get('overview')
  async getOverview(
    @Req() req: any,
    @Query('range') range: string,
    @Query('region') region: string,
  ) {
    return this.developersService.getAnalyticsOverview(
      req.user.id,
      range || '7d',
      region || 'worldwide',
    );
  }

  @Get('traffic')
  async getTraffic(
    @Req() req: any,
    @Query('range') range: string,
    @Query('region') region: string,
  ) {
    return this.developersService.getAnalyticsTraffic(
      req.user.id,
      range || '7d',
      region || 'worldwide',
    );
  }

  @Get('devices')
  async getDevices(
    @Req() req: any,
    @Query('range') range: string,
    @Query('region') region: string,
  ) {
    return this.developersService.getAnalyticsDevices(
      req.user.id,
      range || '7d',
      region || 'worldwide',
    );
  }

  @Get('realtime')
  async getRealtime(@Req() req: any) {
    return this.developersService.getAnalyticsRealtime(req.user.id);
  }
}
