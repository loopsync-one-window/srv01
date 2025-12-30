import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { RegisterDeveloperDto } from './dto/register-developer.dto';
import { CreatePaymentOrderDto } from './dto/create-payment-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { DeveloperStatus, DeveloperPaymentStatus } from '@prisma/client';
import {
  UpdateProfileDto,
  UpdateNotificationsDto,
  DeleteAccountDto,
} from './dto/settings.dto';

@Injectable()
export class DevelopersService {
  private razorpay: Razorpay;
  private s3Client: S3Client;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.razorpay = new Razorpay({
      key_id: this.configService.getOrThrow('RAZORPAY_KEY_ID'),
      key_secret: this.configService.getOrThrow('RAZORPAY_KEY_SECRET'),
    });

    try {
      this.s3Client = new S3Client({
        region: 'ap-south-1',
        credentials: {
          accessKeyId:
            this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
          secretAccessKey: this.configService.getOrThrow<string>(
            'AWS_SECRET_ACCESS_KEY',
          ),
        },
      });
    } catch (e) {
      console.warn('AWS S3 Client failed to initialize', e);
    }
  }

  async register(dto: RegisterDeveloperDto) {
    const existingDev = await this.prisma.developer.findUnique({
      where: { email: dto.email },
    });
    if (existingDev) {
      throw new ConflictException('Developer with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const developer = await this.prisma.developer.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        passwordHash,
        status: 'PENDING_PAYMENT',
      },
    });

    return {
      success: true,
      registrationId: developer.id,
      message:
        'Registration initiated. Complete payment to activate your developer account.',
      license: {
        type: 'Developer License',
        version: 'Perpetual License - vPA4',
      },
      pricing: {
        baseFee: 388.04,
        tax: 69.85,
        verifiedBadgeFee: 399.89,
        currency: 'INR',
      },
    };
  }

  async createPaymentOrder(dto: CreatePaymentOrderDto) {
    const developer = await this.prisma.developer.findUnique({
      where: { id: dto.registrationId },
    });
    if (!developer) throw new NotFoundException('Developer not found');

    const baseFee = 388.04;
    const tax = 69.85;
    const verifiedFee = dto.verifiedBadge ? 399.89 : 0;
    // const baseFee = 1.04;
    // const tax = 1.50;
    // const verifiedFee = dto.verifiedBadge ? 1.90 : 0;
    const totalAmount = baseFee + tax + verifiedFee;

    const amountInPaisa = Math.round(totalAmount * 100);

    const order = await this.razorpay.orders.create({
      amount: amountInPaisa,
      currency: 'INR',
      receipt: developer.id,
    });

    await this.prisma.developerPaymentOrder.create({
      data: {
        developerId: developer.id,
        orderId: order.id,
        amount: totalAmount, // Store in Rupees in DB for readability/consistency with other monetary fields
        currency: 'INR',
        status: DeveloperPaymentStatus.PENDING,
      },
    });

    // Update verified badge preference
    if (dto.verifiedBadge !== undefined) {
      await this.prisma.developer.update({
        where: { id: developer.id },
        data: { verifiedBadge: dto.verifiedBadge },
      });
    }

    return {
      success: true,
      orderId: order.id,
      amount: amountInPaisa, // Return in Paise to frontend
      currency: 'INR',
    };
  }

  async verifyPayment(dto: VerifyPaymentDto) {
    const generatedSignature = crypto
      .createHmac(
        'sha256',
        this.configService.getOrThrow('RAZORPAY_KEY_SECRET'),
      )
      .update(`${dto.orderId}|${dto.paymentId}`)
      .digest('hex');

    if (generatedSignature !== dto.signature) {
      throw new BadRequestException('Invalid payment signature');
    }

    const order = await this.prisma.developerPaymentOrder.findUnique({
      where: { orderId: dto.orderId },
    });
    if (!order) throw new NotFoundException('Order not found');

    await this.prisma.developerPaymentOrder.update({
      where: { id: order.id },
      data: { status: DeveloperPaymentStatus.SUCCESS },
    });

    const developer = await this.prisma.developer.update({
      where: { id: order.developerId },
      data: {
        status: DeveloperStatus.ACTIVE,
        license: 'PERPETUAL_VPA4',
      },
    });

    return {
      success: true,
      message: 'Developer registration completed successfully.',
      developer: {
        id: developer.id,
        status: developer.status,
        verifiedBadge: developer.verifiedBadge,
      },
    };
  }

  // Admin Methods
  async findAll() {
    return this.prisma.developer.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        paymentOrders: {
          orderBy: { createdAt: 'desc' },
          take: 1, // Get latest payment order status
        },
        _count: {
          select: { apps: true },
        },
      },
    });
  }

  async findOneById(id: string) {
    return this.prisma.developer.findUnique({
      where: { id },
      include: {
        paymentOrders: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async delete(id: string) {
    await this.prisma.developerApiKey.deleteMany({
      where: { developerId: id },
    });
    await this.prisma.developerPaymentOrder.deleteMany({
      where: { developerId: id },
    });

    return this.prisma.developer.delete({
      where: { id },
    });
  }

  async getAllPurchases() {
    const purchases = await this.prisma.invoice.findMany({
      where: { status: 'PAID' },
      orderBy: { createdAt: 'desc' },
    });

    // Populate App Names manually
    const enrichedPurchases = [];
    for (const purchase of purchases) {
      let appName = 'Unknown App';
      if (purchase.paymentReferenceId) {
        const app = await this.prisma.app.findUnique({
          where: { id: purchase.paymentReferenceId },
          select: { name: true }
        });
        if (app) appName = app.name;
      }
      enrichedPurchases.push({
        ...purchase,
        appName
      });
    }
    return enrichedPurchases;
  }

  async getAllContributions() {
    const invoices = await this.prisma.invoice.findMany({
      where: { type: 'CONTRIBUTION' },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });

    // Populate App Names
    const enriched = [];
    for (const inv of invoices) {
      let appName = 'Unknown App';
      let appIcon = null;
      if (inv.paymentReferenceId) {
        const app = await this.prisma.app.findUnique({
          where: { id: inv.paymentReferenceId },
          select: { name: true, icons: true },
        });
        if (app) {
          appName = app.name;
          appIcon = app.icons;
        }
      }
      enriched.push({
        ...inv,
        appName,
        appIcon,
      });
    }
    return enriched;
  }

  // Settings Methods

  async getProfile(developerId: string) {
    const developer = await this.prisma.developer.findUnique({
      where: { id: developerId },
      select: {
        fullName: true,
        email: true,
        bio: true,
        avatarUrl: true,
        visibility: true,
        license: true,
        verifiedBadge: true,
        status: true,
      },
    });
    if (!developer) throw new NotFoundException('Developer not found');

    const paymentOrder = await this.prisma.developerPaymentOrder.findFirst({
      where: { developerId: developerId, status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
    });

    return {
      displayName: developer.fullName,
      email: developer.email,
      bio: developer.bio,
      avatarUrl: developer.avatarUrl || 'https://cdn.loopsync.cloud/avatar.png',
      visibility: developer.visibility,
      license: developer.license,
      verifiedBadge: developer.verifiedBadge,
      status: developer.status,
      financials: {
        totalPaid: paymentOrder?.amount || 0,
        currency: paymentOrder?.currency || 'INR',
      },
    };
  }

  async updateProfile(developerId: string, dto: UpdateProfileDto) {
    const data: any = {};
    if (dto.displayName) data.fullName = dto.displayName; // Mapping back
    if (dto.bio !== undefined) data.bio = dto.bio;

    return this.prisma.developer.update({
      where: { id: developerId },
      data,
      select: { fullName: true, bio: true },
    });
  }

  async getApiKeys(developerId: string) {
    const keys = await this.prisma.developerApiKey.findMany({
      where: { developerId },
      orderBy: { createdAt: 'desc' },
    });
    return {
      keys: keys.map((k) => ({
        id: k.id,
        type: k.type,
        prefix: k.prefix,
        createdAt: k.createdAt.toISOString().split('T')[0],
        status: k.status,
      })),
    };
  }

  async rollApiKey(developerId: string, keyId: string) {
    const key = await this.prisma.developerApiKey.findUnique({
      where: { id: keyId },
    });

    if (!key || key.developerId !== developerId) {
      // Ideally 404
      if (!key) throw new NotFoundException('API Key not found');
      // Or if verifying ownership, maybe 404 to hide existence
      throw new NotFoundException('API Key not found');
    }

    const rawKey = this.generateRandomKey(key.type);
    const keyHash = await bcrypt.hash(rawKey, 10);
    const prefix = rawKey.substring(0, 20) + '...';

    await this.prisma.developerApiKey.update({
      where: { id: keyId },
      data: {
        keyHash,
        prefix,
        status: 'active', // Reactivate if it was disabled? "Regenerate" usually implies generic new active key
      },
    });

    return { newKey: rawKey };
  }

  async createApiKey(developerId: string, type: string) {
    const rawKey = this.generateRandomKey(type);
    const keyHash = await bcrypt.hash(rawKey, 10);
    const prefix = rawKey.substring(0, 20) + '...';

    const key = await this.prisma.developerApiKey.create({
      data: {
        developerId,
        type,
        keyHash,
        prefix,
        status: 'active',
      },
    });

    return {
      id: key.id,
      key: rawKey,
      type: key.type,
      prefix: key.prefix,
      status: key.status,
      createdAt: key.createdAt.toISOString().split('T')[0],
    };
  }

  async deleteApiKey(developerId: string, keyId: string) {
    const key = await this.prisma.developerApiKey.findUnique({
      where: { id: keyId },
    });

    if (!key || key.developerId !== developerId) {
      throw new NotFoundException('API Key not found');
    }

    return this.prisma.developerApiKey.delete({
      where: { id: keyId },
    });
  }

  async uploadAvatar(developerId: string, file: Express.Multer.File) {
    const bucketName = this.configService.getOrThrow('AWS_S3_BUCKET_NAME');
    const region = 'ap-south-1'; // Standardize region usage too if needed, or get from config

    const key = `avatars/${developerId}-${Date.now()}-${file.originalname}`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
    } catch (e) {
      console.error('S3 Upload Failed', e);
      throw new BadRequestException('Failed to upload image to S3');
    }

    const avatarUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

    return this.prisma.developer.update({
      where: { id: developerId },
      data: { avatarUrl },
      select: { avatarUrl: true },
    });
  }

  async uploadPanCard(developerId: string, file: Express.Multer.File) {
    if (!this.s3Client) {
      throw new InternalServerErrorException(
        'AWS S3 is not configured on the server.',
      );
    }

    const bucketName = this.configService.getOrThrow('AWS_S3_BUCKET_NAME');
    const region = 'ap-south-1';

    const key = `documents/pan/${developerId}-${Date.now()}-${file.originalname}`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
    } catch (e) {
      console.error('S3 Upload Failed', e);
      throw new BadRequestException('Failed to upload document to S3');
    }

    const panCardUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

    return this.prisma.developer.update({
      where: { id: developerId },
      data: { panCardUrl } as any,
      select: { panCardUrl: true } as any,
    });
  }

  private generateRandomKey(type: string) {
    const randomPart = crypto.randomBytes(32).toString('hex');
    const prefix = type === 'production' ? 'pro_live_' : 'pro_test_';
    return `${prefix}${randomPart}`;
  }

  async getNotifications(developerId: string) {
    const dev = await this.prisma.developer.findUnique({
      where: { id: developerId },
      select: {
        deploymentStatus: true,
        payoutUpdates: true,
        marketingEmails: true,
      },
    });
    if (!dev) throw new NotFoundException('Developer not found');
    return dev;
  }

  async updateNotifications(developerId: string, dto: UpdateNotificationsDto) {
    return this.prisma.developer.update({
      where: { id: developerId },
      data: { ...dto },
      select: {
        deploymentStatus: true,
        payoutUpdates: true,
        marketingEmails: true,
      },
    });
  }

  async deleteAccount(developerId: string, dto: DeleteAccountDto) {
    if (!dto.confirm) throw new BadRequestException('Confirmation required');

    // Detailed cleanup
    await this.delete(developerId);

    return { success: true };
  }

  // ------------------- Banking & Payouts APIs -------------------

  async getPayoutAccount(developerId: string) {
    const dev: any = await this.prisma.developer.findUnique({
      where: { id: developerId },
    });
    if (!dev) throw new NotFoundException('Developer not found');
    return {
      id: dev.id,
      bankName: dev.bankName,
      accountHolder: dev.accountHolder,
      accountLast4: dev.accountNumber ? dev.accountNumber.slice(-4) : '',
      isPrimary: true, // Mock logic
      verified: true, // Mock logic
    };
  }

  async updatePayoutAccount(developerId: string, body: any) {
    return this.prisma.developer.update({
      where: { id: developerId },
      data: {
        bankName: body.bankName,
        accountNumber: body.accountNumber,
        ifsc: body.ifsc,
        accountHolder: body.accountHolder,
      } as any,
    });
  }

  async getTaxInfo(developerId: string) {
    const dev: any = await this.prisma.developer.findUnique({
      where: { id: developerId },
    });
    if (!dev) throw new NotFoundException('Developer not found');
    return {
      gstin: dev.gstin,
      pan: dev.pan,
      panCardUrl: dev.panCardUrl,
      status: dev.taxVerified ? 'verified' : 'pending',
      billingAddress: dev.billingAddress,
    };
  }

  async updateTaxInfo(developerId: string, body: any) {
    return this.prisma.developer.update({
      where: { id: developerId },
      data: {
        billingAddress: body.billingAddress,
        ...(body.gstin && { gstin: body.gstin }),
        ...(body.pan && { pan: body.pan }),
        ...(body.panCardUrl && { panCardUrl: body.panCardUrl }),
      },
    });
  }

  async getPayoutSchedule(developerId: string) {
    const dev: any = await this.prisma.developer.findUnique({
      where: { id: developerId },
    });
    if (!dev) throw new NotFoundException('Developer not found');

    // Calculate next payout: 1st of next month
    const now = new Date();
    const nextMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      dev.payoutDay || 1,
    );

    return {
      type: dev.payoutScheduleType,
      cycle: dev.payoutCycle,
      day: dev.payoutDay,
      nextPayout: nextMonth.toISOString().split('T')[0],
    };
  }

  async updatePayoutSchedule(developerId: string, body: any) {
    return this.prisma.developer.update({
      where: { id: developerId },
      data: {
        payoutDay: body.day,
      } as any,
    });
  }

  async getTransactions(developerId: string) {
    const payments = await this.prisma.developerPaymentOrder.findMany({
      where: { developerId, status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      items: payments.map((p) => ({
        id: p.orderId,
        date: p.createdAt.toISOString().split('T')[0],
        description: `Payment Order #${p.orderId.slice(-4)}`,
        status: 'completed',
        amount: p.amount,
        currency: p.currency,
      })),
    };
  }
  async getRevenueSummary(developerId: string) {
    // 1. Get developer's apps
    const apps = await this.prisma.app.findMany({
      where: { developerId },
      select: { id: true },
    });
    const appIds = apps.map((a) => a.id);

    if (appIds.length === 0) {
      return {
        totalEarnings: 0,
        currency: 'INR',
        monthlyGrowthPercent: 0,
        nextPayout: {
          amount: 0,
          currency: 'INR',
          status: 'pending',
          scheduledFor: new Date().toISOString().split('T')[0],
        },
      };
    }

    // 2. Fetch all paid invoices for these apps (REVENUE)
    const allInvoices = await this.prisma.invoice.findMany({
      where: {
        paymentReferenceId: { in: appIds },
        status: 'PAID',
      },
      select: { amount: true, createdAt: true },
    });

    // 3. Calculate Total Revenue (platform wide)
    const totalRevenue = allInvoices.reduce((acc, inv) => acc + inv.amount, 0);

    // 4. Developer Share (80%)
    const developerShare = totalRevenue * 0.8;

    // 5. Calculate Monthly Growth
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const currentMonthRevenue = allInvoices
      .filter((inv) => inv.createdAt >= startOfCurrentMonth)
      .reduce((acc, inv) => acc + inv.amount, 0);

    const lastMonthRevenue = allInvoices
      .filter(
        (inv) =>
          inv.createdAt >= startOfLastMonth && inv.createdAt <= endOfLastMonth,
      )
      .reduce((acc, inv) => acc + inv.amount, 0);

    let growthPercent = 0;
    if (lastMonthRevenue > 0) {
      growthPercent =
        ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100;
    } else if (currentMonthRevenue > 0) {
      growthPercent = 100;
    }

    // Calculate next payout date (1st of next month)
    const nextPayoutDate = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
    ).toISOString().split('T')[0];

    return {
      totalEarnings: totalRevenue, // Exhibit A: Total Gross Revenue
      currency: 'INR',
      monthlyGrowthPercent: parseFloat(growthPercent.toFixed(1)),
      nextPayout: {
        amount: developerShare, // Exhibit B: Net Payout (80%)
        currency: 'INR',
        status: 'pending',
        scheduledFor: nextPayoutDate,
      },
    };
  }

  async getRevenueTransactions(
    developerId: string,
    limit: number,
    page: number = 1,
  ) {
    const apps = await this.prisma.app.findMany({
      where: { developerId },
      select: { id: true, name: true },
    });
    const appIds = apps.map((a) => a.id);
    const appMap = new Map(apps.map((a) => [a.id, a.name]));

    const where = {
      paymentReferenceId: { in: appIds },
      status: { in: ['PAID', 'PENDING'] as any },
    };

    const total = await this.prisma.invoice.count({ where });

    const invoices = await this.prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    });

    return {
      items: invoices.map((inv) => ({
        id: inv.id,
        date: inv.createdAt.toISOString().split('T')[0],
        description: `Purchase: ${appMap.get(inv.paymentReferenceId || '') || 'Unknown App'}`,
        status: inv.status.toLowerCase(),
        amount: inv.amount, // Full amount paid by user
        currency: inv.currency,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async exportRevenueReport(
    developerId: string,
    format: string,
    period: string, // Currently unused, defaults to all history
  ) {
    if (format !== 'csv') return 'Unsupported format';

    const apps = await this.prisma.app.findMany({
      where: { developerId },
      select: { id: true, name: true },
    });
    const appIds = apps.map((a) => a.id);
    const appMap = new Map(apps.map((a) => [a.id, a.name]));

    const invoices = await this.prisma.invoice.findMany({
      where: {
        paymentReferenceId: { in: appIds },
        status: 'PAID',
      },
      orderBy: { createdAt: 'desc' },
    });

    const header = 'Date,Description,Status,Amount,Currency\n';
    const rows = invoices.map((inv) => {
      const date = inv.createdAt.toISOString().split('T')[0];
      const desc = `Purchase: ${appMap.get(inv.paymentReferenceId || '') || 'Unknown App'}`;
      const status = inv.status;
      const amount = inv.amount.toFixed(2);
      const currency = inv.currency;
      return `${date},${desc},${status},${amount},${currency}`;
    });

    return header + rows.join('\n');
  }

  async getAnalyticsOverview(
    developerId: string,
    range: string,
    region: string,
    appId?: string,
  ) {
    const agg = await this.prisma.app.aggregate({
      where: { developerId, ...(appId && { id: appId }) },
      _sum: { users: true },
    });
    const totalUsers = agg._sum.users || 0;

    // Heuristics for non-tracked metrics based on real user count
    const activeSessions = Math.round(totalUsers * 0.08) + 12; // ~8% active + baseline

    return {
      totalUsers: totalUsers,
      totalUsersChangePercent: 4, // Placeholder for historical diff
      activeSessions: activeSessions,
      activeSessionsChangePercent: 2,
      avgSessionDurationSec: 245,
      avgSessionDurationChangePercent: 1.2,
    };
  }

  async getAnalyticsTraffic(
    developerId: string,
    range: string,
    region: string,
    appId?: string,
  ) {
    // Generate realistic traffic curve based on total users
    // This distributes the "Total Users" somewhat realistically over the last 7 points
    // Note: This is a simulation since we don't not have daily analytics rows in DB
    const agg = await this.prisma.app.aggregate({
      where: { developerId, ...(appId && { id: appId }) },
      _sum: { users: true },
    });
    const totalUsers = agg._sum.users || 0;

    // Create a 7-day trend
    const base = totalUsers / 20; // Daily generic baseline
    const points = [];
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (const day of days) {
      // Random variance +/- 20%
      const daily = Math.round(base * (0.8 + Math.random() * 0.4));
      points.push({ label: day, users: daily });
    }

    return { points };
  }

  async getAnalyticsDevices(
    developerId: string,
    range: string,
    region: string,
    appId?: string,
  ) {
    // Static distribution as we don't track User-Agent in current schema
    return {
      devices: [
        { type: 'Desktop', percentage: 65 },
        { type: 'Mobile', percentage: 25 },
        { type: 'Tablet', percentage: 10 },
      ],
    };
  }

  async getAnalyticsRealtime(developerId: string, appId?: string) {
    const agg = await this.prisma.app.aggregate({
      where: { developerId, ...(appId && { id: appId }) },
      _sum: { users: true },
    });
    const totalUsers = agg._sum.users || 0;

    // Simulate ~1-3% of users being "live" right now
    const activeUsers = Math.max(1, Math.round(totalUsers * (0.01 + Math.random() * 0.02)));

    return {
      activeUsers: activeUsers,
      activeSessions: Math.round(activeUsers * 0.8),
      requestsPerMinute: activeUsers * 4 + Math.floor(Math.random() * 50),
    };
  }

  async getOverviewSnapshot(developerId: string, search: string = '') {
    const dev = await this.prisma.developer.findUnique({
      where: { id: developerId },
    });
    if (!dev) throw new NotFoundException('Developer not found');

    // Logic to get time of day (server time)
    const hour = new Date().getHours();
    let timeOfDay = 'good morning';
    if (hour >= 12 && hour < 17) timeOfDay = 'good afternoon';
    if (hour >= 17) timeOfDay = 'good evening';

    // Fetch actual apps
    const dbApps = await this.prisma.app.findMany({
      where: {
        developerId,
        name: { contains: search, mode: 'insensitive' },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const apps = dbApps.map((app) => ({
      id: app.id,
      name: app.name,
      status: app.status,
      users: app.users,
      color: app.color,
      logoUrl: (() => {
        if (!app.icons) return null;
        const icons = app.icons as any;
        if (typeof icons === 'string') return icons;
        if (typeof icons === 'object') {
          return (
            icons['512'] || icons['144'] || Object.values(icons)[0] || null
          );
        }
        return null;
      })(),
      rejectionReason: (app as any).rejectionReason || null,
    }));

    // Generate activity from apps
    const activity = dbApps
      .map((app) => ({
        id: `evt_create_${app.id}`,
        type: 'app_created',
        message: 'Application created',
        appName: app.name,
        timestamp: app.createdAt.toISOString(),
      }))
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, 5);

    // Filter activity based on search if needed, but typically search is for apps.
    // We will return all activity for now or could filter by app name.

    // Check for missing requirements
    const missingRequirements: string[] = [];
    if (!dev.bio) missingRequirements.push('Add a bio to your profile');
    if (!dev.avatarUrl) missingRequirements.push('Upload a profile picture');
    if (!dev.pan) missingRequirements.push('Add your Permanent Account Number (PAN)');
    if (!dev.panCardUrl) missingRequirements.push('Upload your PAN Card copy');
    if (!dev.billingAddress) missingRequirements.push('Add your billing address');

    return {
      context: {
        displayName: dev.fullName.split(' ')[0], // First name
        timeOfDay: timeOfDay,
        missingRequirements,
      },
      apps: apps,
      activity: activity,
    };
  }

  async createApp(
    developerId: string,
    data: { name: string; status?: string; color?: string },
  ) {
    return this.prisma.app.create({
      data: {
        name: data.name,
        status: data.status || 'draft',
        color: data.color || 'bg-white',
        developerId,
      },
    });
  }

  async deleteApp(developerId: string, appId: string) {
    // Verify ownership
    const app = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!app || app.developerId !== developerId) {
      throw new NotFoundException('App not found or access denied');
    }

    return this.prisma.app.delete({
      where: { id: appId },
    });
  }

  async getApp(developerId: string, appId: string) {
    let app = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!app || app.developerId !== developerId) {
      throw new NotFoundException('App not found or access denied');
    }

    if (app.status === 'terminated') {
      throw new ForbiddenException(
        'This application has been terminated due to policy violations. Access is restricted.',
      );
    }

    // Check for verifyKey, handling potential stale Prisma Client type definition
    let verifyKey = (app as any).verifyKey;

    // Fallback: If verifyKey is missing, check if it exists in DB via raw query (bypassing stale client cache)
    if (!verifyKey) {
      try {
        const raw: any[] = await this.prisma.$queryRawUnsafe(
          `SELECT "verifyKey" FROM "App" WHERE "id" = '${appId}'`,
        );
        if (raw && raw.length > 0 && raw[0].verifyKey) {
          verifyKey = raw[0].verifyKey;
          (app as any).verifyKey = verifyKey;
        }
      } catch (e) {
        // Ignore raw query error
      }
    }

    // Check if the key is a "mock" key (from previous seeding or dev environments) and force regeneration
    if (
      verifyKey &&
      typeof verifyKey === 'string' &&
      verifyKey.startsWith('mock-')
    ) {
      verifyKey = null; // invalid, force regen
    }

    if (!verifyKey) {
      verifyKey = this.generateVerifyKey(150);
      try {
        // Try standard update first
        const updated = await this.prisma.app.update({
          where: { id: appId },
          data: { verifyKey } as any,
        });
        // If standard update returned the key, good.
        if ((updated as any).verifyKey) {
          app = updated;
        } else {
          // Stale client stripped the field. Manually update via raw query.
          await this.prisma.$executeRawUnsafe(
            `UPDATE "App" SET "verifyKey" = '${verifyKey}' WHERE "id" = '${appId}'`,
          );
          (app as any).verifyKey = verifyKey;
        }
      } catch (e) {
        // Fallback to raw update if standard update failed completely
        try {
          await this.prisma.$executeRawUnsafe(
            `UPDATE "App" SET "verifyKey" = '${verifyKey}' WHERE "id" = '${appId}'`,
          );
          (app as any).verifyKey = verifyKey;
        } catch (rawEx) {
          console.error('Failed to set verifyKey', rawEx);
        }
      }
    }

    return app;
  }

  private generateVerifyKey(length: number): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  async updateAppMetadata(developerId: string, appId: string, data: any) {
    await this.getApp(developerId, appId);
    // Filter out sensitive or non-updatable fields if necessary,
    // but for now trust the controller/DTO or just spread.
    // Prisma will scream if unknown fields are passed, so we should be careful.
    // Ideally we map data to AppUpdateInput.

    // Remove 'id', 'developerId', etc from data just in case
    const { id, developerId: dId, createdAt, updatedAt, ...updateData } = data;

    return this.prisma.app.update({
      where: { id: appId },
      data: {
        ...updateData,
        updatedAt: new Date(),
      },
    });
  }

  async generateUploadUrl(
    developerId: string,
    appId: string,
    type: string,
    mimeType?: string,
    fileName?: string,
    size?: number,
  ) {
    await this.getApp(developerId, appId);

    let key = '';
    const contentType = mimeType || 'application/octet-stream';

    if (type === 'build') {
      const fName = fileName || 'app.zip';
      key = `apps/${appId}/builds/${fName}`;
    } else {
      // banner, icon, screenshot
      const ext = mimeType ? mimeType.split('/')[1] : 'png';
      key = `apps/${appId}/assets/${type}/${Date.now()}.${ext}`;
    }

    const command = new PutObjectCommand({
      Bucket: this.configService.getOrThrow('AWS_S3_BUCKET_NAME'),
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 3600,
    });
    const region = 'ap-south-1';
    const bucket = this.configService.getOrThrow('AWS_S3_BUCKET_NAME');
    const assetUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

    return { uploadUrl, assetUrl };
  }

  async updateAppAssets(developerId: string, appId: string, assets: any) {
    await this.getApp(developerId, appId);
    // Clean assets object
    return this.prisma.app.update({
      where: { id: appId },
      data: assets,
    });
  }

  async verifyApp(developerId: string, appId: string, verifyKey: string) {
    const app = await this.getApp(developerId, appId);
    if ((app as any).verifyKey !== verifyKey) {
      throw new BadRequestException('Invalid verify key');
    }
    return { verified: true };
  }

  async publishAppStatus(developerId: string, appId: string) {
    const app = await this.getApp(developerId, appId);
    if (!app.name) {
      throw new BadRequestException('App name is required');
    }

    return this.prisma.app.update({
      where: { id: appId },
      data: { status: 'review' },
    });
  }

  // Admin Review Methods
  async getAllAppsForAdmin() {
    return this.prisma.app.findMany({
      include: {
        developer: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        _count: {
          select: { reviews: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getAppsForReview() {
    return this.prisma.app.findMany({
      where: { status: 'review' },
      include: {
        developer: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: { updatedAt: 'asc' },
    });
  }

  async getAppDetailsForAdmin(appId: string) {
    return this.prisma.app.findUnique({
      where: { id: appId },
      include: {
        developer: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatarUrl: true,
          },
        },
        // @ts-ignore
        currentBuild: true,
      },
    });
  }

  async approveApp(appId: string) {
    return this.prisma.app.update({
      where: { id: appId },
      data: {
        status: 'live',
        // @ts-ignore
        rejectionReason: null,
      },
    });
  }

  async rejectApp(appId: string, reason: string) {
    return this.prisma.app.update({
      where: { id: appId },
      data: {
        status: 'rejected',
        // @ts-ignore
        rejectionReason: reason,
        history: {
          create: {
            action: 'REJECTED',
            reason: reason,
          },
        },
      },
    });
  }

  async getAppHistory(appId: string) {
    return this.prisma.appHistory.findMany({
      where: { appId },
      orderBy: { createdAt: 'desc' },
    });
  }


  async reopenApp(appId: string) {
    return this.prisma.app.update({
      where: { id: appId },
      data: {
        status: 'review',
        history: {
          create: {
            action: 'REOPENED',
            reason: 'Reopened by admin',
          },
        },
      },
    });
  }

  async terminateApp(appId: string) {
    return this.prisma.app.update({
      where: { id: appId },
      data: {
        status: 'terminated',
        history: {
          create: {
            action: 'TERMINATED',
            reason: 'Terminated by admin',
          },
        },
        // @ts-ignore
        rejectionReason: 'Terminated by Administrator due to Policy Violation.',
      },
    });
  }

  async publishApp(appId: string, buildDetails?: any) {
    // Guaranteed publish flow
    const now = new Date();
    const prisma = this.prisma as any;

    let currentBuildId = null;

    // 1. If buildDetails provided, create/register new build
    if (buildDetails && buildDetails.platform && buildDetails.buildId) {
      // Create new build record (implied "Register Build" action)
      const newBuild = await prisma.build.create({
        data: {
          appId,
          version: buildDetails.version || '1.0.0', // Default if not provided
          status: 'approved',
          isActive: true,
          platforms: {
            [buildDetails.platform]: {
              buildId: buildDetails.buildId,
              sizeMB: buildDetails.sizeMB || 0,
              path: buildDetails.path, // Store full path if needed for reference
            }
          }
        }
      });
      currentBuildId = newBuild.id;

      // Deactivate other builds
      await prisma.build.updateMany({
        where: { appId, id: { not: newBuild.id } },
        data: { isActive: false },
      });

    } else {
      // Fallback: Find latest build if no details provided
      const latestBuild = await prisma.build.findFirst({
        where: { appId },
        orderBy: { createdAt: 'desc' },
      });

      if (latestBuild) {
        await prisma.build.update({
          where: { id: latestBuild.id },
          data: {
            status: 'approved',
            isActive: true,
          },
        });
        await prisma.build.updateMany({
          where: { appId, id: { not: latestBuild.id } },
          data: { isActive: false },
        });
        currentBuildId = latestBuild.id;
      }
    }

    // 3. Update App
    return this.prisma.app.update({
      where: { id: appId },
      data: {
        ...(buildDetails?.color ? { color: buildDetails.color } : {}), // Update color if provided
        ...(buildDetails?.privacyTracking ? { privacyTracking: buildDetails.privacyTracking } : {}),
        ...(buildDetails?.privacyLinked ? { privacyLinked: buildDetails.privacyLinked } : {}),
        ...(buildDetails?.ageRating ? { ageRating: buildDetails.ageRating } : {}),
        ...(buildDetails?.copyright ? { copyright: buildDetails.copyright } : {}),
        ...(buildDetails?.website ? { website: buildDetails.website } : {}), // Optional override
        ...(buildDetails?.supportEmail ? { supportEmail: buildDetails.supportEmail } : {}), // Optional override
        status: 'live', // Published
        // @ts-ignore
        publishedAt: now,
        // @ts-ignore
        currentBuildId: currentBuildId,
        history: {
          create: {
            action: 'PUBLISHED',
            reason: 'Approved and published by admin',
          },
        },
      },
      include: {
        // @ts-ignore
        currentBuild: true,
      }
    });
  }
  async uploadBuild(appId: string, version: string, platform: string, file: Express.Multer.File) {
    console.log(`[UploadBuild] Starting upload for App: ${appId}, File: ${file.originalname}, Size: ${file.size}`);
    const bucketName = this.configService.getOrThrow('AWS_S3_BUCKET_NAME');
    const folderPrefix = `apps/${appId}/builds/`;

    // Clean up old builds to replace with new one
    try {
      const listedObjects = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: folderPrefix,
        }),
      );

      if (listedObjects.Contents && listedObjects.Contents.length > 0) {
        console.log(`[UploadBuild] Cleaning up ${listedObjects.Contents.length} old files`);
        const deleteParams = {
          Bucket: bucketName,
          Delete: { Objects: listedObjects.Contents.map(({ Key }) => ({ Key })) },
        };
        await this.s3Client.send(new DeleteObjectsCommand(deleteParams));
      } else {
        console.log(`[UploadBuild] No old files to cleanup`);
      }
    } catch (e) {
      console.warn('[UploadBuild] Failed to cleanup old builds:', e);
    }

    // Key format: apps/{appId}/builds/{filename}
    // Matching the structure used in generateUploadUrl and required by the user
    const key = `apps/${appId}/builds/${file.originalname}`;
    console.log(`[UploadBuild] Uploading to Key: ${key}`);

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: file.buffer,
          // ContentType: file.mimetype, // Optional for binary
        }),
      );
      console.log(`[UploadBuild] Upload success`);
    } catch (err) {
      console.error(`[UploadBuild] Upload failed`, err);
      throw err;
    }

    return {
      key,
      url: `https://${bucketName}.s3.ap-south-1.amazonaws.com/${key}`,
      filename: file.originalname
    };
  }

  async getReviewsForAdmin(appId: string) {
    // @ts-ignore
    const reviews = await this.prisma.review.findMany({
      where: { appId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true, email: true } }
      }
    });

    return reviews.map((r: any) => ({
      ...r,
      userName: r.user ? r.user.fullName : 'Guest',
      userEmail: r.user ? r.user.email : 'Unknown'
    }));
  }

  async deleteReviewAdmin(appId: string, reviewId: string) {
    // @ts-ignore
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });

    if (!review) throw new NotFoundException('Review not found');

    // @ts-ignore
    await this.prisma.review.delete({ where: { id: reviewId } });
    return { success: true };
  }
}
