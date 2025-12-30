import { Controller, Post, Body, UseGuards, Req, BadRequestException, Get, Param } from '@nestjs/common';
import { StorePaymentService } from './store-payment.service';
import { AccessTokenGuard } from 'src/common/guards/access-token.guard';
import { OptionalAuthGuard } from 'src/common/guards/optional-auth.guard';
import { CreateOrderDto, VerifyPaymentDto, CreateContributionDto, VerifyContributionDto } from './store-payment.dto';

@Controller('store/payment')
export class StorePaymentController {
    constructor(private readonly paymentService: StorePaymentService) { }

    @UseGuards(OptionalAuthGuard)
    @Post('order')
    createOrder(@Req() req: any, @Body() dto: CreateOrderDto) {
        const userId = req.user?.id || req.user?.sub; // Handle both id or sub depending on strategy output
        return this.paymentService.createOrder(userId, dto.appId);
    }

    @UseGuards(OptionalAuthGuard)
    @Post('contribution/order')
    createContributionOrder(@Req() req: any, @Body() dto: CreateContributionDto) {
        const userId = req.user?.id || req.user?.sub;
        return this.paymentService.createContributionOrder(userId, dto.appId, dto.amount);
    }

    @UseGuards(OptionalAuthGuard)
    @Post('contribution/verify')
    verifyContribution(@Req() req: any, @Body() dto: VerifyContributionDto) {
        const userId = req.user?.id || req.user?.sub;
        return this.paymentService.verifyContribution(userId, dto);
    }

    @UseGuards(OptionalAuthGuard)
    @Post('verify')
    verifyPayment(@Req() req: any, @Body() dto: VerifyPaymentDto) {
        const userId = req.user?.id || req.user?.sub;
        return this.paymentService.verifyPayment(userId, dto);
    }

    @UseGuards(AccessTokenGuard)
    @Get('status/:appId')
    checkOwnership(@Req() req: any, @Param('appId') appId: string) {
        return this.paymentService.checkOwnership(req.user?.sub, appId);
    }
}
