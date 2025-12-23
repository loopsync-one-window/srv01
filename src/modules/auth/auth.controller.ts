import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  Get,
  UseGuards,
  UseInterceptors,
  Redirect,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import {
  SignupEmailDto,
  LoginEmailDto,
  RefreshTokenDto,
  VerifyEmailOtpDto,
  RequestEmailOtpDto,
  SignupGoogleDto,
  CheckEligibilityDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
} from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('signup-email')
  async signupEmail(@Body() dto: SignupEmailDto) {
    return this.authService.registerWithEmail(
      dto.fullName,
      dto.email,
      dto.password,
    );
  }

  @Post('signup-google')
  async signupGoogle(
    @Body() dto: SignupGoogleDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.registerWithGoogle(
      dto.googleId,
      dto.email,
      dto.fullName,
    );
    const tokens = await this.authService.login(user);

    // Set refresh token as HTTP-only cookie
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return {
      accessToken: tokens.accessToken,
      user: tokens.user,
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('login-email')
  async loginEmail(
    @Body() dto: LoginEmailDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(dto.email, dto.password);
    const tokens = await this.authService.login(user);

    // Set refresh token as HTTP-only cookie
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      user: tokens.user,
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.refreshAccessToken(dto.refreshToken);

    // Set new refresh token as HTTP-only cookie
    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      user: tokens.user,
    };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = req.user as any;
    await this.authService.logout(user.id);

    // Clear refresh token cookie
    res.clearCookie('refreshToken');

    return { message: 'Successfully logged out' };
  }

  @Post('logout-any')
  async logoutAny(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: any,
  ) {
    const cookieRefresh = (req as any).cookies?.refreshToken;
    const headerAuth = (req.headers['authorization'] || '').toString();
    const bearer = headerAuth.startsWith('Bearer ')
      ? headerAuth.slice(7)
      : undefined;
    const refreshToken = body?.refreshToken || cookieRefresh;
    const accessToken = body?.accessToken || bearer;
    const result = await this.authService.forceLogout(
      refreshToken,
      accessToken,
    );
    res.clearCookie('refreshToken');
    return result;
  }

  @Post('help-support')
  async helpSupport(@Body() body: any) {
    const {
      accessToken,
      fullName,
      email,
      userId,
      subject,
      category,
      description,
    } = body || {};
    if (
      !accessToken ||
      !fullName ||
      !email ||
      !userId ||
      !subject ||
      !category ||
      !description
    ) {
      return { success: false, message: 'Missing required fields' };
    }
    const result = await this.authService.sendSupportEmail({
      accessToken,
      fullName,
      email,
      userId,
      subject,
      category,
      description,
    });
    return result;
  }

  @Post('request-email-otp')
  async requestEmailOtp(@Body() dto: RequestEmailOtpDto) {
    // Find the user by email
    const user = await this.authService.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      // For security reasons, we don't reveal if the email exists or not
      // But we still return a success message to prevent email enumeration
      return { message: 'If the email exists, an OTP has been sent to it.' };
    }

    // Generate and send OTP
    await this.authService.generateAndSendOtp(user.id, user.email);

    return { message: 'OTP sent successfully' };
  }

  @Post('verify-email-otp')
  async verifyEmailOtp(@Body() dto: VerifyEmailOtpDto) {
    const user = await this.authService.verifyEmailOtp(dto.userId, dto.code);
    const tokens = await this.authService.login(user);

    return {
      message: 'Email verified successfully',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: tokens.user,
    };
  }

  @Get('google/login')
  @UseGuards(AuthGuard('google'))
  async googleLoginAuth(@Req() req: any) {
    // Initiates Google OAuth flow for login
    // Passport automatically redirects to Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: any, @Res() res: Response) {
    try {
      console.log('Google Callback initiated. User:', req.user);
      // req.user contains the user info from GoogleStrategy
      const { googleId, email, fullName } = req.user;

      // Register or login the user
      const user = await this.authService.registerWithGoogle(
        googleId,
        email,
        fullName,
      );

      console.log('User registered/logged in via Google:', user.id, user.email, 'Account Type:', user.accountType);

      const tokens = await this.authService.login(user);

      // Set refresh token as HTTP-only cookie
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // Prepare redirect parameters
      const redirectParams = new URLSearchParams({
        userData: JSON.stringify(tokens.user),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt ? new Date(tokens.expiresAt).toISOString() : '',
      });

      if (user.accountType === 'VISITOR') {
        // Redirect to plan selection page with user data and tokens
        console.log('Redirecting VISITOR to open-account/pro');
        redirectParams.set('pro', 'true');
        return res.redirect(
          `https://www.loopsync.cloud/open-account?${redirectParams.toString()}`,
        );
      } else if (user.accountType === 'CUSTOMER') {
        // Redirect to home page with tokens for CUSTOMER accounts
        console.log('Redirecting CUSTOMER to home');
        return res.redirect(
          `https://www.loopsync.cloud/home?${redirectParams.toString()}`,
        );
      } else {
        // Redirect to home page with tokens (home page should also handle saving tokens if redirected here)
        console.log('Redirecting other account type to open-account/login', user.accountType);
        return res.redirect(
          `https://www.loopsync.cloud/open-account?${redirectParams.toString()}&login=true`,
        );
      }
    } catch (error) {
      console.error('Error in Google Callback:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // Redirect to frontend with error details
      return res.redirect(
        `https://www.loopsync.cloud/open-account?login=true&error=GoogleCallbackError&reason=${encodeURIComponent(errorMessage)}`
      );
    }
  }

  @Post('check-eligibility')
  async checkEligibility(@Body() dto: CheckEligibilityDto) {
    const { isEligible } = await this.authService.checkEligibility(dto.email);
    return { isEligible };
  }

  @Post('request-password-reset')
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.email, dto.code, dto.newPassword);
  }
}
