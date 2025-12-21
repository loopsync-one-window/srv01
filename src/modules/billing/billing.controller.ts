import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  Headers,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BillingService } from './billing.service';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from '../users/users.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(
    private configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
    private readonly usersService: UsersService,
  ) {
    const keyId = this.configService.get<string>('razorpay.keyId');
  }

  @Post('webhook/payment-details')
  async getPaymentDetails(@Body() body: any) {
    if (body.paymentId) {
      return this.billingService.getPaymentDetails(body.paymentId);
    } else if (body.subscriptionId) {
      return this.billingService.getSubscriptionDetails(body.subscriptionId);
    }
    return { success: false, error: 'Either paymentId or subscriptionId is required' };
  }

  private async getUserEmail(userId: string) {
    const user = await this.usersService.findOneById(userId);
    return user?.email;
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('create-order')
  async createOrder(@Req() req: any, @Body() data: any) {
    const userId = req.user.id;
    const orderData = {
      ...data,
      userId,
    };

    return this.billingService.processPayment(orderData);
  }

  @Post('webhook')
  async handleWebhook(
    @Body() data: any,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    return this.billingService.handleWebhook(data, signature);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('details')
  async getDetails(@Req() req: any) {
    const userId = req.user.id;
    return this.billingService.getBillingDetails(userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('overview')
  async getOverview(@Req() req: any) {
    const userId = req.user.id;
    return this.billingService.getOverview(userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('credits')
  async getCredits(@Req() req: any) {
    const userId = req.user.id;
    return this.billingService.getCreditsByUserId(userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('credits/ledger')
  async getCreditLedger(@Req() req: any) {
    const email = req.query?.email;
    return this.billingService.getCreditLedger(email);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('usage/history')
  async getUsageHistory(@Req() req: any) {
    const email = req.query?.email;
    return this.billingService.getUsageHistory(email);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('subscription/sync')
  async syncSubscription(@Req() req: any, @Body() body: any) {
    const userId = req.user.id;
    return this.billingService.syncSubscription(userId, body?.subscriptionId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('subscription/reset')
  async resetSubscription(@Req() req: any, @Body() body: any) {
    const userId = req.user.id;
    return this.billingService.resetSubscription(userId, body?.subscriptionId);
  }

  @Post('consume')
  async consume(@Headers('x-pepron-key') pepronKey: string, @Body() body: any) {
    const allowedKeys = [
      'atlas.access.ATLAS001ARCT',
      'ceres.access.9048BBDGEB32',
      'loopsync.access.LOOPSYNC0124HYB6T381',
    ];
    if (!pepronKey || !allowedKeys.includes(pepronKey)) {
      return { success: false, error: 'UNAUTHORIZED' };
    }

    const email = body?.email;
    if (!email) return { success: false, error: 'Email required' };

    return this.billingService.consumeCredits({
      email,
      cost: body?.cost,
      resource: body?.resource,
      requestId: body?.requestId,
    });
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('credits/add')
  async addCredits(@Body() body: any) {
    return this.billingService.addCredits({
      email: body?.email,
      type: body?.type,
      amount: body?.amount,
      reason: body?.reason,
      referenceId: body?.referenceId,
    });
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('credits/deduct')
  async deductCredits(@Body() body: any) {
    return this.billingService.deductCredits({
      email: body?.email,
      amount: body?.amount,
      deductFrom: body?.deductFrom,
      reason: body?.reason,
      referenceId: body?.referenceId,
    });
  }
}
