
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
                baseFee: 1.00,
                tax: 1.00,
                verifiedBadgeFee: 1.00,
                currency: 'INR',
            },
        };
    }

    async createPaymentOrder(dto: CreatePaymentOrderDto) {
        const developer = await this.prisma.developer.findUnique({
            where: { id: dto.registrationId },
        });
        if (!developer) throw new NotFoundException('Developer not found');

        const baseFee = 1.00;
        const tax = 1.00;
        const verifiedFee = dto.verifiedBadge ? 1.00 : 0;
        const totalAmount = baseFee + tax + verifiedFee;

        const order = await this.razorpay.orders.create({
            amount: Math.round(totalAmount * 100), // in paise
            currency: 'INR',
            receipt: developer.id,
        });

        await this.prisma.developerPaymentOrder.create({
            data: {
                developerId: developer.id,
                orderId: order.id,
                amount: totalAmount,
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
            amount: totalAmount,
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
}
