import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
    });
  }

  async validate(payload: any) {
    console.log('Validating Admin Token Payload:', JSON.stringify(payload));
    if (payload.type !== 'admin') {
      console.error('Invalid token type:', payload.type);
      throw new UnauthorizedException('Not an admin token');
    }
    const admin = await this.prisma.admin.findUnique({
      where: { id: payload.sub },
    });
    if (!admin) {
      console.error('Admin user not found:', payload.sub);
      throw new UnauthorizedException();
    }
    const { passwordHash, ...result } = admin;
    return result;
  }
}
