
import { Controller, Post, Body, Res, HttpCode, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { LoginEmailDto } from '../auth/dto/login-email.dto';

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
            const tokens = await this.authService.loginDeveloper(developer);

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
}
