import { Controller, Post, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { DevelopersService } from './developers.service';
import { AuthService } from '../auth/auth.service';
import { RegisterDeveloperDto } from './dto/register-developer.dto';
import { CreatePaymentOrderDto } from './dto/create-payment-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';

@Controller('api/v1/developers')
export class DevelopersController {
  constructor(
    private readonly developersService: DevelopersService,
    private readonly authService: AuthService,
  ) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDeveloperDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.developersService.register(dto);

    // Generate session (refresh token) for the new pending developer
    // This ensures if they reload the page, they can resume the flow
    const developer = await this.authService.validateDeveloper(
      dto.email,
      dto.password,
    );

    if (developer) {
      const tokens = await this.authService.loginDeveloper(developer);

      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return {
        ...result,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      };
    }

    return result;
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
