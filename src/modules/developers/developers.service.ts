
import {
    Injectable,
    ConflictException,
    BadRequestException,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';
import { RegisterDeveloperDto } from './dto/register-developer.dto';
import { CreatePaymentOrderDto } from './dto/create-payment-order.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { DeveloperStatus, DeveloperPaymentStatus } from '@prisma/client';
import { UpdateProfileDto, UpdateNotificationsDto, DeleteAccountDto } from './dto/settings.dto';

@Injectable()
export class DevelopersService {
    private razorpay: Razorpay;

    constructor(
        private prisma: PrismaService,
        private configService: ConfigService,
    ) {
        this.razorpay = new Razorpay({
            key_id: this.configService.getOrThrow('RAZORPAY_KEY_ID'),
            key_secret: this.configService.getOrThrow('RAZORPAY_KEY_SECRET'),
        });
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
                status: DeveloperStatus.PENDING_PAYMENT,
            },
        });

        return {
            success: true,
            registrationId: developer.id,
            message: 'Registration initiated. Complete payment to activate your developer account.',
            license: {
                type: 'Developer License',
                version: 'Perpetual License - vPA4',
            },
            pricing: {
                baseFee: 1.04,
                tax: 1.50,
                verifiedBadgeFee: 1.90,
                currency: 'INR',
            },
            // pricing: {
            //     baseFee: 388.04,
            //     tax: 69.85,
            //     verifiedBadgeFee: 399.89,
            //     currency: 'INR',
            // },
        };
    }

    async createPaymentOrder(dto: CreatePaymentOrderDto) {
        const developer = await this.prisma.developer.findUnique({
            where: { id: dto.registrationId },
        });
        if (!developer) throw new NotFoundException('Developer not found');

        // const baseFee = 388.04;
        // const tax = 69.85;
        // const verifiedFee = dto.verifiedBadge ? 399.89 : 0;
        const baseFee = 1.04;
        const tax = 1.50;
        const verifiedFee = dto.verifiedBadge ? 1.90 : 0;
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
            .createHmac('sha256', this.configService.getOrThrow('RAZORPAY_KEY_SECRET'))
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
        await this.prisma.developerApiKey.deleteMany({ where: { developerId: id } });
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
            },
        });
        if (!developer) throw new NotFoundException('Developer not found');
        return {
            displayName: developer.fullName, // Mapping fullName to displayName as per req, or strict mapping
            email: developer.email,
            bio: developer.bio,
            avatarUrl: developer.avatarUrl || 'https://cdn.loopsync.cloud/avatar.png',
            visibility: developer.visibility,
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
            keys: keys.map(k => ({
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

    private generateRandomKey(type: string) {
        const randomPart = crypto.randomBytes(32).toString('hex');
        const prefix = type === 'production' ? 'pro_live_' : 'pro_test_';
        return `${prefix}${randomPart}`;
    }

    async getNotifications(developerId: string) {
        const dev = await this.prisma.developer.findUnique({
            where: { id: developerId },
            select: { deploymentStatus: true, payoutUpdates: true, marketingEmails: true },
        });
        if (!dev) throw new NotFoundException('Developer not found');
        return dev;
    }

    async updateNotifications(developerId: string, dto: UpdateNotificationsDto) {
        return this.prisma.developer.update({
            where: { id: developerId },
            data: { ...dto },
            select: { deploymentStatus: true, payoutUpdates: true, marketingEmails: true },
        });
    }

    async deleteAccount(developerId: string, dto: DeleteAccountDto) {
        if (!dto.confirm) throw new BadRequestException('Confirmation required');

        // Detailed cleanup
        await this.delete(developerId);

        return { success: true };
    }
}
