import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DevelopersService } from './developers.service';
import { Response } from 'express';

@Controller('api/v1/revenue')
@UseGuards(AuthGuard('jwt'))
export class RevenueController {
  constructor(private readonly developersService: DevelopersService) {}

  @Get('summary')
  async getSummary(@Req() req: any) {
    return this.developersService.getRevenueSummary(req.user.id);
  }

  @Get('transactions')
  async getTransactions(@Req() req: any, @Query('limit') limit: string) {
    return this.developersService.getRevenueTransactions(
      req.user.id,
      parseInt(limit) || 20,
    );
  }

  @Get('export')
  async exportReport(
    @Req() req: any,
    @Query('format') format: string,
    @Query('period') period: string,
    @Res() res: Response,
  ) {
    const report = await this.developersService.exportRevenueReport(
      req.user.id,
      format,
      period,
    );

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="revenue-report-${period}.csv"`,
      );
      res.send(report);
    } else {
      // Default or other formats
      res.send(report);
    }
  }
}
