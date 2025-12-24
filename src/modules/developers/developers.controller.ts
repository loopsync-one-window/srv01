
import { Controller, Post, Body } from '@nestjs/common';
import { DevelopersService } from './developers.service';
import { RegisterDeveloperDto } from './dto/register-developer.dto';
import { CreatePaymentOrderDto } from './dto/create-payment-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

@Controller('api/v1/developers')
export class DevelopersController {
    constructor(private readonly developersService: DevelopersService) { }

    @Post('register')
    async register(@Body() dto: RegisterDeveloperDto) {
        return this.developersService.register(dto);
    }

    @Post('payment/create-order')
    async createPaymentOrder(@Body() dto: CreatePaymentOrderDto) {
        return this.developersService.createPaymentOrder(dto);
    }

    @Post('payment/verify')
    async verifyPayment(@Body() dto: VerifyPaymentDto) {
        return this.developersService.verifyPayment(dto);
    }
}
