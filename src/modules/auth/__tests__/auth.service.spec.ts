import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../../email/email.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let emailService: EmailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            emailOtp: {
              create: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
            getOrThrow: jest.fn(),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendOtpEmail: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
    emailService = module.get<EmailService>(EmailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUser', () => {
    it('should return user data if credentials are valid', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const user = {
        id: '1',
        email,
        passwordHash: '$2b$10$somesaltandsomehash', // bcrypt hash of 'password123'
        fullName: 'Test User',
        provider: 'EMAIL',
        status: 'VERIFIED',
        accountType: 'CUSTOMER',
        createdAt: new Date(),
        updatedAt: new Date(),
        refreshTokenHash: null,
      };

      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user);
      require('bcrypt').compare = jest.fn().mockResolvedValue(true);

      const result = await service.validateUser(email, password);
      expect(result).toEqual({
        id: '1',
        email,
        fullName: 'Test User',
        provider: 'EMAIL',
        status: 'VERIFIED',
        accountType: 'CUSTOMER',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });
  });
});
