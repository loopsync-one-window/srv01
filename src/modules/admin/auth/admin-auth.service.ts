import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminAuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) { }

  async validateAdmin(email: string, pass: string): Promise<any> {
    const admin = await this.prisma.admin.findUnique({ where: { email } });
    if (admin && (await bcrypt.compare(pass, admin.passwordHash))) {
      const { passwordHash, ...result } = admin;
      return result;
    }
    return null;
  }

  async login(admin: any) {
    const payload = {
      email: admin.email,
      sub: admin.id,
      role: admin.role,
      type: 'admin',
    };
    return {
      accessToken: this.jwtService.sign(payload),
      admin: {
        id: admin.id,
        email: admin.email,
        fullName: admin.fullName,
        role: admin.role,
      },
    };
  }

  async register(data: { email: string; password: string; fullName: string }) {
    // Check if admin exists
    const existing = await this.prisma.admin.findUnique({
      where: { email: data.email },
    });
    if (existing) {
      throw new ConflictException('Admin already exists');
    }

    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(data.password, salt);

    const admin = await this.prisma.admin.create({
      data: {
        email: data.email,
        passwordHash,
        fullName: data.fullName,
      },
    });

    return this.login(admin);
  }
}
