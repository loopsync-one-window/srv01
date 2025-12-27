import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Request,
} from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private authService: AdminAuthService) { }

  @Post('login')
  async login(@Body() body: any) {
    const user = await this.authService.validateAdmin(
      body.email,
      body.password,
    );
    if (!user) {
      return { success: false, message: 'Invalid credentials' };
    }
    return this.authService.login(user); // returns { accessToken, admin }
  }

  @Post('register')
  async register(@Body() body: any) {
    // TODO: Protect this endpoint or remove after initial setup
    return this.authService.register(body);
  }
}
