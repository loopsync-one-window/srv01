import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UpgradeService } from './upgrade.service';

@ApiTags('upgrade')
@Controller('upgrade')
export class UpgradeController {
  constructor(private readonly upgradeService: UpgradeService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('checkout')
  @ApiOperation({ summary: 'Create autopay subscription for upgrading plan' })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Upgrade subscription created' })
  async upgradeCheckout(
    @Req() req: any,
    @Body()
    body: {
      email: string;
      contact?: string;
      newPlanCode: string;
      billingCycle: 'MONTHLY' | 'ANNUAL';
    },
  ) {
    const userId = req.user.id;
    return this.upgradeService.createUpgradeSubscription({
      userId,
      email: body.email,
      contact: body.contact,
      newPlanCode: body.newPlanCode,
      billingCycle: body.billingCycle,
    });
  }
}
