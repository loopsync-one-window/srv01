import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import { VerifyPaymentDto, VerifyContributionDto } from './store-payment.dto';
import { hash } from 'bcrypt';

import { JwtService } from '@nestjs/jwt';

@Injectable()
export class StorePaymentService {
    private razorpay: any;

    constructor(
        private prisma: PrismaService,
        private configService: ConfigService,
        private jwtService: JwtService,
    ) {
        const keyId = this.configService.get<string>('RAZORPAY_KEY_ID');
        const keySecret = this.configService.get<string>('RAZORPAY_KEY_SECRET');

        if (keyId && keySecret) {
            this.razorpay = new Razorpay({
                key_id: keyId,
                key_secret: keySecret,
            });
        }
    }

    async createOrder(userId: string | undefined, appId: string) {
        if (!this.razorpay) {
            throw new InternalServerErrorException('Payment gateway not configured');
        }

        const app = await this.prisma.app.findUnique({
            where: { id: appId },
        });

        if (!app) {
            throw new NotFoundException('App not found');
        }

        if (app.pricingModel !== 'paid' || !app.price) {
            throw new BadRequestException('This app is not for sale');
        }

        // Check if already purchased (only if logged in)
        if (userId) {
            const existing = await this.prisma.invoice.findFirst({
                where: {
                    userId,
                    status: 'PAID',
                    paymentReferenceId: appId,
                    type: 'SINGLE_PURCHASE',
                },
            });

            if (existing) {
                throw new BadRequestException('You already own this app');
            }
        }

        // Create Razorpay Order
        const options = {
            amount: app.price * 100, // Amount in paise
            currency: 'INR',
            receipt: `rcpt_${Date.now().toString().slice(-10)}_${Math.random().toString(36).substring(2, 6)}`,
            notes: {
                userId: userId || 'guest',
                appId,
                appName: app.name.substring(0, 30),
            },
        };

        try {
            const order = await this.razorpay.orders.create(options);
            return {
                id: order.id,
                amount: order.amount,
                currency: order.currency,
                keyId: this.configService.get<string>('RAZORPAY_KEY_ID'),
                appName: app.name,
                description: `Purchase ${app.name}`,
            };
        } catch (error) {
            console.error('Razorpay Error:', error);
            throw new InternalServerErrorException('Failed to create payment order');
        }
    }

    async verifyPayment(userId: string | undefined, dto: VerifyPaymentDto) {
        if (!this.razorpay) {
            throw new InternalServerErrorException('Payment gateway not configured');
        }

        const { razorpayOrderId, razorpayPaymentId, razorpaySignature, appId } = dto;
        const secret = this.configService.get<string>('RAZORPAY_KEY_SECRET') || '';

        // Verify Signature
        const generatedSignature = crypto
            .createHmac('sha256', secret)
            .update(razorpayOrderId + '|' + razorpayPaymentId)
            .digest('hex');

        if (generatedSignature !== razorpaySignature) {
            // Log failure? (Only if we have a userId to log against, or skip)
            throw new BadRequestException('Invalid payment signature');
        }

        // Fetch App details
        const app = await this.prisma.app.findUnique({
            where: { id: appId },
        });

        if (!app) throw new NotFoundException('App not found');

        // Handle Guest User
        let targetUserId = userId;
        if (!targetUserId) {
            try {
                // Fetch payment details to get email
                const payment = await this.razorpay.payments.fetch(razorpayPaymentId);
                const email = payment.email;
                const contact = payment.contact;

                if (!email) {
                    // Fallback? Can't create user without email.
                    // Maybe log it as an Orphaned Invoice if we allow nullable user (we don't)
                    // Or create a dummy user
                    throw new Error("Email required for guest checkout");
                }

                // Find or Create User
                let user = await this.prisma.user.findUnique({ where: { email } });
                if (!user) {
                    // Create new user
                    const passwordHash = await hash(crypto.randomBytes(8).toString('hex'), 10);
                    user = await this.prisma.user.create({
                        data: {
                            email,
                            fullName: 'Guest User', // Should get from payment.notes or input if possible, but razorpay doesn't strictly force it
                            passwordHash,
                            provider: 'EMAIL',
                            status: 'PENDING_VERIFICATION',
                            accountType: 'CUSTOMER',
                        }
                    });
                }
                targetUserId = user.id;

            } catch (e) {
                console.error("Failed to handle guest user creation", e);
                throw new InternalServerErrorException("Failed to process guest user");
            }
        }

        // Success - Create Invoice
        const invoiceNumber = `INV-${Date.now()}-${targetUserId!.substring(0, 4)}`;

        const invoice = await this.prisma.invoice.create({
            data: {
                invoiceNumber,
                userId: targetUserId!,
                type: 'SINGLE_PURCHASE',
                amount: app.price || 0,
                currency: 'INR',
                status: 'PAID',
                paymentProvider: 'razorpay',
                paymentReferenceId: appId,
            },
        });

        // Generate Access Token for immediate login/access
        const user = await this.prisma.user.findUnique({ where: { id: targetUserId! } });
        const payload = { email: user?.email, sub: user?.id, role: 'USER' };
        const accessToken = this.jwtService.sign(payload);

        return { success: true, invoiceId: invoice.id, accessToken };
    }

    async createContributionOrder(userId: string | undefined, appId: string, amount: number) {
        if (!this.razorpay) {
            throw new InternalServerErrorException('Payment gateway not configured');
        }

        if (amount < 50 || amount > 1000000000) {
            throw new BadRequestException('Amount must be between ₹50 and ₹100 Crores');
        }

        const app = await this.prisma.app.findUnique({
            where: { id: appId },
        });

        if (!app) {
            throw new NotFoundException('App not found');
        }

        // Create Razorpay Order
        const options = {
            amount: amount * 100, // Amount in paise
            currency: 'INR',
            receipt: `cont_${Date.now().toString().slice(-10)}_${Math.random().toString(36).substring(2, 6)}`,
            notes: {
                userId: userId || 'guest',
                appId,
                appName: app.name.substring(0, 30),
                type: 'CONTRIBUTION'
            },
        };

        try {
            const order = await this.razorpay.orders.create(options);
            return {
                id: order.id,
                amount: order.amount,
                currency: order.currency,
                keyId: this.configService.get<string>('RAZORPAY_KEY_ID'),
                appName: app.name,
                description: `Contribution to ${app.name}`,
            };
        } catch (error) {
            console.error('Razorpay Error:', error);
            throw new InternalServerErrorException('Failed to create contribution order');
        }
    }

    async verifyContribution(userId: string | undefined, dto: VerifyContributionDto) {
        if (!this.razorpay) {
            throw new InternalServerErrorException('Payment gateway not configured');
        }

        const { razorpayOrderId, razorpayPaymentId, razorpaySignature, appId } = dto;
        const secret = this.configService.get<string>('RAZORPAY_KEY_SECRET') || '';

        // Verify Signature
        const generatedSignature = crypto
            .createHmac('sha256', secret)
            .update(razorpayOrderId + '|' + razorpayPaymentId)
            .digest('hex');

        if (generatedSignature !== razorpaySignature) {
            throw new BadRequestException('Invalid payment signature');
        }

        // Fetch Payment to get real amount
        // Fetch App details
        const app = await this.prisma.app.findUnique({
            where: { id: appId },
        });
        if (!app) throw new NotFoundException('App not found');

        let targetUserId = userId;
        let paidAmount = 0;

        try {
            const payment = await this.razorpay.payments.fetch(razorpayPaymentId);
            paidAmount = payment.amount / 100; // Convert to main unit
            const email = payment.email;

            if (!targetUserId) {
                if (!email) throw new Error("Email required for guest checkout");
                let user = await this.prisma.user.findUnique({ where: { email } });
                if (!user) {
                    const passwordHash = await hash(crypto.randomBytes(8).toString('hex'), 10);
                    user = await this.prisma.user.create({
                        data: {
                            email,
                            fullName: 'Guest Contributor',
                            passwordHash,
                            provider: 'EMAIL',
                            status: 'PENDING_VERIFICATION',
                            accountType: 'CUSTOMER',
                        }
                    });
                }
                targetUserId = user.id;
            }
        } catch (e) {
            console.error("Failed to process payment/user", e);
            throw new InternalServerErrorException("Failed to verify contribution details");
        }

        // Success - Create Invoice (Contribution)
        const invoiceNumber = `CONT-${Date.now()}-${targetUserId!.substring(0, 4)}`;

        const invoice = await this.prisma.invoice.create({
            data: {
                invoiceNumber,
                userId: targetUserId!,
                type: 'CONTRIBUTION',
                amount: paidAmount,
                currency: 'INR',
                status: 'PAID',
                paymentProvider: 'razorpay',
                paymentReferenceId: appId,
            },
        });

        // Return token if guest/new user, else just success
        let accessToken = undefined;
        if (!userId) {
            const user = await this.prisma.user.findUnique({ where: { id: targetUserId! } });
            if (user) {
                const payload = { email: user.email, sub: user.id, role: 'USER' };
                accessToken = this.jwtService.sign(payload);
            }
        }

        return { success: true, invoiceId: invoice.id, accessToken };
    }

    async checkOwnership(userId: string, appId: string) {
        const purchase = await this.prisma.invoice.findFirst({
            where: {
                userId,
                status: 'PAID',
                paymentReferenceId: appId,
                type: 'SINGLE_PURCHASE',
            },
        });
        return { owned: !!purchase };
    }
}
