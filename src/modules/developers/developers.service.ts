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
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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
    // Mock data as per requirements (real implementation would query DB)
    return {
      totalEarnings: 14290.8,
      currency: 'INR',
      monthlyGrowthPercent: 15.3,
      nextPayout: {
        amount: 2450.0,
        currency: 'INR',
        status: 'pending',
        scheduledFor: '2026-01-01',
      },
    };
  }

  async getRevenueTransactions(developerId: string, limit: number) {
    // Mock data matching the requested structure
    return {
      items: [
        {
          id: 'txn_8821',
          date: '2025-12-20',
          description: 'Payout #8821',
          status: 'completed',
          amount: 3100.0,
          currency: 'INR',
        },
        {
          id: 'txn_7732',
          date: '2025-11-20',
          description: 'Payout #7732',
          status: 'completed',
          amount: 2950.0,
          currency: 'INR',
        },
      ],
    };
  }

  async exportRevenueReport(
    developerId: string,
    format: string,
    period: string,
  ) {
    // Generate CSV content
    if (format === 'csv') {
      const header = 'Date,Description,Status,Amount,Currency\n';
      const row1 = '2025-12-20,Payout #8821,completed,3100.00,INR\n';
      const row2 = '2025-11-20,Payout #7732,completed,2950.00,INR\n';
      return header + row1 + row2;
    }
    return 'Unsupported format';
  }

  async getAnalyticsOverview(
    developerId: string,
    range: string,
    region: string,
  ) {
    // Mock data tailored to range/region if needed (static for now)
    return {
      totalUsers: 12543,
      totalUsersChangePercent: 12,
      activeSessions: 842,
      activeSessionsChangePercent: 5,
      avgSessionDurationSec: 272,
      avgSessionDurationChangePercent: 8,
    };
  }

  async getAnalyticsTraffic(
    developerId: string,
    range: string,
    region: string,
  ) {
    // Mock daily traffic data
    return {
      points: [
        { label: 'Mon', users: 4000 },
        { label: 'Tue', users: 3000 },
        { label: 'Wed', users: 2000 },
        { label: 'Thu', users: 2780 },
        { label: 'Fri', users: 1890 },
        { label: 'Sat', users: 2390 },
        { label: 'Sun', users: 3490 },
      ],
    };
  }

  async getAnalyticsDevices(
    developerId: string,
    range: string,
    region: string,
  ) {
    // Mock device breakdown
    return {
      devices: [
        { type: 'Desktop', percentage: 65 },
        { type: 'Mobile', percentage: 25 },
        { type: 'Tablet', percentage: 10 },
      ],
    };
  }

  async getAnalyticsRealtime(developerId: string) {
    // Mock live snapshot
    return {
      activeUsers: Math.floor(Math.random() * 50) + 100, // random variation
      activeSessions: Math.floor(Math.random() * 30) + 80,
      requestsPerMinute: Math.floor(Math.random() * 100) + 300,
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

    return {
      context: {
        displayName: dev.fullName.split(' ')[0], // First name
        timeOfDay: timeOfDay,
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
      },
    });
  }

  async terminateApp(appId: string) {
    return this.prisma.app.update({
      where: { id: appId },
      data: {
        status: 'terminated',
        // @ts-ignore
        rejectionReason: 'Terminated by Administrator due to Policy Violation.',
      },
    });
  }
}
