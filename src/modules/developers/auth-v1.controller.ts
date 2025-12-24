import { Controller, Post, Body, Res, Req, HttpCode, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { Response, Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { LoginEmailDto } from '../auth/dto/login-email.dto';
import { DeveloperStatus } from '@prisma/client';

@Controller('api/v1/auth')
export class AuthV1Controller {
    constructor(private readonly authService: AuthService) { }

    @HttpCode(HttpStatus.OK)
    @Post('login')
    async login(
        @Body() dto: LoginEmailDto,
        @Res({ passthrough: true }) res: Response,
    ) {
        // Check if it's a developer
        const developer = await this.authService.validateDeveloper(dto.email, dto.password);

        if (developer) {
            if (developer.status === DeveloperStatus.PENDING_PAYMENT) {
                return {
                    paymentRequired: true,
                    developerId: developer.id,
                    message: "Payment not completed",
                    pricing: {
                        baseFee: 1.00,
                        tax: 1.00,
                        verifiedBadgeFee: 1.00,
                        currency: 'INR',
                    }
                };
            }

            const tokens = await this.authService.loginDeveloper(developer);

            res.cookie('refreshToken', tokens.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000,
            });

            // Developer Access Token returned in JSON only (memory storage)
            // No access_token cookie for developers as requested

            return tokens;
        }

        // Fallback to regular user login
        try {
            const user = await this.authService.validateUser(dto.email, dto.password);
            const tokens = await this.authService.login(user);

            res.cookie('refreshToken', tokens.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000,
            });

            res.cookie('access_token', tokens.accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 15 * 60 * 1000,
            });

            return {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresAt: tokens.expiresAt,
                user: tokens.user,
            };
        } catch (error) {
            throw new UnauthorizedException('Invalid credentials');
        }
    }

    @HttpCode(HttpStatus.OK)
    @Post('refresh')
    async refresh(
        @Req() req: Request,
        @Res({ passthrough: true }) res: Response,
        @Body() body: any,
    ) {
        const refreshToken = req.cookies['refreshToken'] || body.refreshToken;

        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token not found');
        }

        try {
            // Try developer refresh first
            const tokens = await this.authService.refreshDeveloperToken(refreshToken);

            // Check status again in case they are still pending (edge case if they got a token somehow)
            if (tokens.developer.accountStatus === DeveloperStatus.PENDING_PAYMENT) {
                return {
                    paymentRequired: true,
                    developerId: tokens.developer.id,
                    message: "Payment not completed",
                    pricing: {
                        baseFee: 1.00,
                        tax: 1.00,
                        verifiedBadgeFee: 1.00,
                        currency: 'INR',
                    }
                };
            }

            res.cookie('refreshToken', tokens.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000,
            });

            return tokens;
        } catch (e) {
            // Try User Refresh
            try {
                const userTokens = await this.authService.refreshAccessToken(refreshToken);

                if ('developer' in userTokens) {
                    throw new UnauthorizedException('Invalid refresh token');
                }

                res.cookie('refreshToken', userTokens.refreshToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 7 * 24 * 60 * 60 * 1000,
                });

                // Existing users expect access_token cookie?
                res.cookie('access_token', userTokens.accessToken, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    maxAge: 15 * 60 * 1000,
                });

                return {
                    accessToken: userTokens.accessToken,
                    refreshToken: userTokens.refreshToken,
                    expiresAt: userTokens.expiresAt,
                    user: userTokens.user,
                };
            } catch (userError) {
                throw new UnauthorizedException('Invalid refresh token');
            }
        }
    }
}
