import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { BillingService } from '../billing/billing.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly billingService: BillingService,
    private readonly authService: AuthService,
    private readonly emailService: EmailService,
  ) {}

  // Expose prisma for other services to use
  getPrisma() {
    return this.prisma;
  }

  async createSubscription(
    userId: string,
    planId: string,
    paymentProvider: string,
    providerSubscriptionId?: string,
    providerPaymentId?: string,
  ) {
    // Fetch the plan to get billing cycle info
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new Error('Plan not found');
    }

    // Calculate expiration date based on billing cycle
    const startedAt = new Date();
    const expiresAt = new Date(startedAt);

    if (plan.billingCycle === 'MONTHLY') {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    } else if (plan.billingCycle === 'ANNUAL') {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    }

    // Create subscription
    const subscription = await this.prisma.subscription.create({
      data: {
        userId,
        planId,
        status: 'ACTIVE',
        startedAt,
        expiresAt,
        autoRenew: true,
        paymentProvider,
        providerSubscriptionId,
        providerPaymentId,
      },
    });

    // Update user account type to CUSTOMER
    await this.usersService.updateAccountType(userId, 'CUSTOMER');

    return subscription;
  }

  async createRecurringSubscription(
    userId: string,
    planId: string,
    paymentProvider: string,
    providerSubscriptionId: string,
    isFreeTrial: boolean = false,
    startDate?: Date, // Optional start date for future subscriptions
    overrideCycle?: 'MONTHLY' | 'ANNUAL',
  ) {
    // Fetch the plan to get billing cycle info
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new Error('Plan not found');
    }

    // Use provided start date or current date
    const startedAt = startDate || new Date();
    const expiresAt = new Date(startedAt);

    const cycle = overrideCycle || plan.billingCycle;
    if (cycle === 'MONTHLY') {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    } else if (cycle === 'ANNUAL') {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    }

    // Create subscription
    const subscription = await this.prisma.subscription.create({
      data: {
        userId,
        planId,
        status: 'ACTIVE', // Activate immediately
        startedAt,
        expiresAt,
        autoRenew: true,
        paymentProvider,
        providerSubscriptionId,
        providerPaymentId: providerSubscriptionId, // For recurring, we use the same ID
      },
    });

    // Update user account type to CUSTOMER
    await this.usersService.updateAccountType(userId, 'CUSTOMER');

    return subscription;
  }

  async getSubscriptionByUserId(userId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
      },
      include: {
        plan: true,
        user: true,
      },
    });

    if (!subscription) {
      return {
        success: true,
        subscription: null,
      };
    }

    const isFreeTrial = await this.computeIsFreeTrial(subscription);

    const deriveCycleFromDates = (
      start: Date,
      end: Date,
    ): 'MONTHLY' | 'ANNUAL' => {
      const ms = end.getTime() - start.getTime();
      const days = Math.max(Math.floor(ms / (24 * 60 * 60 * 1000)), 0);
      return days >= 300 ? 'ANNUAL' : 'MONTHLY';
    };

    const derivedCycle = deriveCycleFromDates(
      subscription.startedAt,
      subscription.expiresAt,
    );

    const defaultPaymentMethod = await this.prisma.paymentMethod.findFirst({
      where: { userId, isDefault: true },
    });

    const displayName =
      subscription.plan.code === 'PRO_PRIME-X'
        ? 'PRO PRIME-X'
        : subscription.plan.code === 'PRO'
          ? 'PRO'
          : subscription.plan.name;

    return {
      success: true,
      subscription: {
        id: subscription.id,
        userId: subscription.userId,
        planId: subscription.planId,
        planName: displayName,
        planCode: subscription.plan.code,
        planAmount:
          this.computeExpectedAmountPaise(
            subscription.plan.code,
            derivedCycle,
          ) || subscription.plan.price,
        planCurrency: subscription.plan.currency,
        status: subscription.status,
        startedAt: subscription.startedAt,
        expiresAt: subscription.expiresAt,
        renewsOn: subscription.expiresAt,
        autoRenew: subscription.autoRenew,
        paymentProvider: subscription.paymentProvider,
        providerSubscriptionId: subscription.providerSubscriptionId,
        providerPaymentId: subscription.providerPaymentId,
        isFreeTrial,
        paymentMethod: defaultPaymentMethod
          ? {
              id: defaultPaymentMethod.id,
              type: defaultPaymentMethod.type,
              providerDetails: defaultPaymentMethod.providerDetails,
            }
          : null,
      },
    };
  }

  private computeExpectedAmountPaise(
    planCode: string,
    cycle: 'MONTHLY' | 'ANNUAL',
  ) {
    if (cycle === 'ANNUAL') {
      if (planCode === 'PRO') return 7399 * 100;
      if (planCode === 'PRO_PRIME-X') return 12599 * 100;
      return 0;
    }
    if (planCode === 'PRO') return 759 * 100;
    if (planCode === 'PRO_PRIME-X') return 1299 * 100;
    return 0;
  }

  async getUserById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
    });
  }

  async handleWebhook(data: any) {
    try {
      console.log('Received Razorpay webhook:', JSON.stringify(data, null, 2));

      const event = data.event;
      switch (event) {
        case 'payment.captured':
          return await this.handlePaymentSuccess(data);
        case 'payment.failed':
          return await this.handlePaymentFailure(data);
        case 'subscription.activated':
        case 'subscription.charged':
          return await this.handleSubscriptionSuccess(data);
        case 'subscription.cancelled':
          return await this.handleSubscriptionCancelled(data);
        case 'subscription.authorized':
        case 'subscription.updated':
          return await this.handleSubscriptionAuthorized(data);
        default:
          console.log(`Unhandled Razorpay event: ${event}`);
          return { success: true, message: `Event ${event} not handled` };
      }
    } catch (error) {
      console.error('Error handling Razorpay webhook:', error);
      return {
        success: false,
        error: error.message || error.toString() || 'Unknown webhook error',
      };
    }
  }

  private async handlePaymentSuccess(data: any) {
    try {
      // Extract payment data properly
      const paymentData = data.payload.payment?.entity;

      if (!paymentData) {
        console.error('Payment data not found in webhook payload');
        return { success: false, error: 'Payment data not found' };
      }

      const paymentId = paymentData.id;
      const orderId = paymentData.order_id;
      const amount = paymentData.amount;
      const email = paymentData.email;
      const notes = paymentData.notes || {};

      // Extract plan code and user ID from notes
      const planCode = notes.planCode;
      const userId = notes.userId;

      console.log('Processing successful payment:', {
        paymentId,
        orderId,
        amount,
        email,
        planCode,
        userId,
      });

      // Find user by email or userId
      let user;
      if (userId) {
        user = await this.prisma.user.findUnique({
          where: { id: userId },
        });
      } else if (email) {
        user = await this.prisma.user.findUnique({
          where: { email },
        });
      }

      if (!user) {
        console.error('User not found for email/userId:', { email, userId });
        return { success: false, error: 'User not found' };
      }

      // Find plan by code
      if (!planCode) {
        console.error('Plan code not found in payment notes');
        return { success: false, error: 'Plan code not found' };
      }

      const plan = await this.prisma.plan.findUnique({
        where: { code: planCode },
      });

      if (!plan) {
        console.error('Plan not found for code:', planCode);
        return { success: false, error: 'Plan not found' };
      }

      // Update user account type to CUSTOMER (always ensure this is set)
      await this.usersService.updateAccountType(user.id, 'CUSTOMER');

      // Check if this was a free trial payment
      // Free trial payments are exactly ₹2 (200 paise)
      const isFreeTrial = amount === 200;

      console.log('Free trial detection result for one-time payment:', {
        isFreeTrial,
        amount,
      });

      // If this was a free trial, mark the email as used
      if (isFreeTrial) {
        try {
          await this.markEmailAsUsed(email);
          console.log('Marked email as used for free trial:', email);
        } catch (error) {
          console.error('Failed to mark email as used for free trial:', error);
          // Continue with the payment processing even if we can't mark the email as used
        }
      }

      // Create subscription in our database for one-time payments
      const existingActive = await this.prisma.subscription.findFirst({
        where: {
          userId: user.id,
          status: 'ACTIVE',
        },
      });

      if (!existingActive) {
        const created = await this.createSubscription(
          user.id,
          plan.id,
          'RAZORPAY',
          undefined,
          paymentId,
        );
        console.log('Created subscription from one-time payment:', created.id);
      } else {
        console.log('Active subscription already exists; skipping creation');
      }

      // Send success email
      await this.sendPaymentSuccessEmail(user, plan, amount, isFreeTrial);

      console.log('Successfully processed payment for user:', user.id);
      return { success: true, message: 'Payment processed successfully' };
    } catch (error) {
      console.error('Error processing payment success:', error);
      return {
        success: false,
        error:
          error.message ||
          error.toString() ||
          'Failed to process payment success',
      };
    }
  }

  private async handleSubscriptionSuccess(data: any) {
    try {
      // Extract subscription and payment data properly
      const subscriptionData = data.payload.subscription?.entity;
      const paymentData = data.payload.payment?.entity;

      if (!subscriptionData) {
        console.error('Subscription data not found in webhook payload');
        return { success: false, error: 'Subscription data not found' };
      }

      const subscriptionId = subscriptionData.id;
      const customerId = subscriptionData.customer_id;
      const planId = subscriptionData.plan_id;
      const email = subscriptionData.email;
      // Get the subscription start time from Razorpay
      const startTime = subscriptionData.start_at;

      // Extract notes from subscription entity (not payment)
      const notes = subscriptionData.notes || {};
      const planCode = notes.planCode;
      const userId = notes.userId;

      // Get amount from payment data if available, otherwise from subscription data
      const amount =
        paymentData?.amount ||
        subscriptionData.quantity * subscriptionData.item?.amount ||
        0;

      console.log('Processing successful subscription:', {
        subscriptionId,
        customerId,
        planId,
        amount,
        email,
        startTime,
        planCode,
        userId,
      });

      // Find user by email or userId
      let user;
      if (userId) {
        user = await this.prisma.user.findUnique({
          where: { id: userId },
        });
      } else if (email) {
        user = await this.prisma.user.findUnique({
          where: { email },
        });
      }

      if (!user) {
        console.error('User not found for email/userId:', { email, userId });
        return { success: false, error: 'User not found' };
      }

      // Find plan by code (notes may be missing in some payloads)
      if (!planCode) {
        console.error('Plan code not found in subscription notes');
      }
      let resolvedPlanCode: string | undefined = planCode;
      let plan = resolvedPlanCode
        ? await this.prisma.plan.findUnique({
            where: { code: resolvedPlanCode },
          })
        : null;

      // Validate autopay payment amount and resolve plan if missing
      const cycle =
        subscriptionData.notes?.billingCycle ||
        subscriptionData.billing_cycle ||
        'MONTHLY';
      const cycleNorm =
        String(cycle).toUpperCase() === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
      if (!plan) {
        const expectedPro = this.computeExpectedAmountPaise('PRO', cycleNorm);
        const expectedPrimeX = this.computeExpectedAmountPaise(
          'PRO_PRIME-X',
          cycleNorm,
        );
        if (amount && expectedPrimeX > 0 && amount >= expectedPrimeX) {
          resolvedPlanCode = 'PRO_PRIME-X';
        } else if (amount && expectedPro > 0 && amount >= expectedPro) {
          resolvedPlanCode = 'PRO';
        }
        plan = resolvedPlanCode
          ? await this.prisma.plan.findUnique({
              where: { code: resolvedPlanCode },
            })
          : null;
      }
      if (!plan) {
        console.error('Plan not found after inference:', resolvedPlanCode);
        return { success: false, error: 'Plan not found' };
      }

      // Determine free trial status only for PRO
      let isFreeTrial = false;
      if (plan.code === 'PRO') {
        if (subscriptionData.trial_end) {
          const trialEndTimestamp = subscriptionData.trial_end;
          const currentTimestamp = Math.floor(Date.now() / 1000);
          if (trialEndTimestamp > currentTimestamp) {
            isFreeTrial = true;
          }
        }
        if (!isFreeTrial && amount <= 200) {
          isFreeTrial = true;
        }
      }

      const expected = this.computeExpectedAmountPaise(plan.code, cycleNorm);
      if (!isFreeTrial && paymentData?.amount && expected > 0) {
        if (paymentData.amount < expected) {
          console.warn(
            'Subscription charge amount less than expected; skipping activation',
            {
              paymentAmount: paymentData.amount,
              expected,
              planCode: plan.code,
              cycle: cycleNorm,
            },
          );
          return { success: false, error: 'UNDERPAID_SUBSCRIPTION' };
        }
      }

      // Check if subscription already exists
      let existingSubscription = await this.prisma.subscription.findFirst({
        where: {
          OR: [{ providerSubscriptionId: subscriptionId }, { userId: user.id }],
        },
      });

      // If subscription doesn't exist, create it
      if (!existingSubscription) {
        const startDate = startTime ? new Date(startTime * 1000) : undefined;
        existingSubscription = await this.createRecurringSubscription(
          user.id,
          plan.id,
          'RAZORPAY',
          subscriptionId,
          isFreeTrial,
          startDate,
          cycleNorm,
        );

        console.log(
          'Created new subscription in database:',
          existingSubscription,
        );
      } else {
        // Update existing subscription if needed
        existingSubscription = await this.prisma.subscription.update({
          where: { id: existingSubscription.id },
          data: {
            status: 'ACTIVE',
            providerSubscriptionId: subscriptionId,
            autoRenew: true,
            ...(startTime ? { startedAt: new Date(startTime * 1000) } : {}),
          },
        });

        console.log(
          'Updated existing subscription in database:',
          existingSubscription,
        );
      }

      // Update user account type to CUSTOMER (always ensure this is set)
      await this.usersService.updateAccountType(user.id, 'CUSTOMER');

      console.log('Free trial detection result:', {
        isFreeTrial,
        amount,
        trialEnd: subscriptionData.trial_end,
      });

      // If this was a free trial, mark the email as used
      if (isFreeTrial) {
        try {
          await this.markEmailAsUsed(email);
          console.log('Marked email as used for free trial:', email);
        } catch (error) {
          console.error('Failed to mark email as used for free trial:', error);
          // Continue with the subscription processing even if we can't mark the email as used
        }
      }

      // Auto-cancel previous active subscription when upgrade completes
      try {
        const otherActive = await this.prisma.subscription.findMany({
          where: {
            userId: user.id,
            status: 'ACTIVE',
            id: { not: existingSubscription.id },
          },
        });

        for (const prev of otherActive) {
          if (prev.providerSubscriptionId) {
            // cancel on provider immediately
            try {
              await (this as any).billingService.cancelSubscription(
                prev.providerSubscriptionId,
                false,
              );
            } catch (e) {
              console.log(
                'Provider cancel failed or not available, will mark cancelled locally',
              );
            }
          }

          await this.prisma.subscription.update({
            where: { id: prev.id },
            data: { status: 'CANCELED', cancelAt: new Date() },
          });
        }
      } catch (e) {
        console.log('Auto-cancel previous subscription error:', e);
      }

      // Initialize billing balances from the activated subscription
      try {
        await (this.billingService as any).syncSubscription(
          user.id,
          existingSubscription.id,
        );
      } catch (e) {
        console.log('Failed to sync billing from subscription:', e);
      }

      // Send success email
      await this.sendPaymentSuccessEmail(user, plan, amount, isFreeTrial);

      console.log('Successfully processed subscription for user:', user.id);
      return {
        success: true,
        message: 'Subscription processed and synced successfully',
        subscriptionId,
      };
    } catch (error) {
      console.error('Error processing subscription success:', error);
      return {
        success: false,
        error:
          error.message ||
          error.toString() ||
          'Failed to process subscription success',
      };
    }
  }

  private async computeIsFreeTrial(subscription: any): Promise<boolean> {
    try {
      const planCode = subscription?.plan?.code;
      if (!planCode || planCode !== 'PRO') return false;

      const userEmail = subscription?.user?.email;
      if (!userEmail) return false;

      const eligible = await this.prisma.eligibleEmail.findUnique({
        where: { email: userEmail },
      });

      if (!eligible || eligible.isUsed !== true) return false;

      const startedAt = new Date(subscription.startedAt).getTime();
      const now = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      return now - startedAt <= sevenDaysMs;
    } catch {
      return false;
    }
  }

  async activateSubscriptionFallback(params: {
    userId: string;
    planCode: string;
    billingCycle: string;
    isRecurring: boolean;
    providerSubscriptionId?: string;
    providerPaymentId?: string;
    email?: string;
  }) {
    const plan = await this.prisma.plan.findUnique({
      where: { code: params.planCode },
    });

    if (!plan) {
      return { success: false, message: 'Plan not found' };
    }

    const existingActive = await this.prisma.subscription.findFirst({
      where: { userId: params.userId, status: 'ACTIVE' },
    });

    const isEligible = params.email
      ? await this.isEligibleForFreeTrial(params.email)
      : false;

    let created;
    if (params.isRecurring && params.providerSubscriptionId) {
      created = await this.createRecurringSubscription(
        params.userId,
        plan.id,
        'RAZORPAY',
        params.providerSubscriptionId,
        isEligible,
        new Date(),
        (params.billingCycle || plan.billingCycle)?.toUpperCase() === 'ANNUAL'
          ? 'ANNUAL'
          : 'MONTHLY',
      );
    } else {
      created = await this.createSubscription(
        params.userId,
        plan.id,
        'RAZORPAY',
        undefined,
        params.providerPaymentId,
      );
    }

    if (existingActive) {
      try {
        if (existingActive.providerSubscriptionId) {
          await this.billingService.cancelSubscription(
            existingActive.providerSubscriptionId,
            false,
          );
        }
      } catch (e) {
        console.log(
          'Provider cancel failed in fallback, proceeding to local cancel',
        );
      }
      await this.prisma.subscription.update({
        where: { id: existingActive.id },
        data: { status: 'CANCELED', cancelAt: new Date() },
      });
    }

    return { success: true, subscriptionId: created.id };
  }

  private async handleSubscriptionCancelled(data: any) {
    try {
      const subscriptionId = data.payload.subscription.entity.id;

      console.log('Processing cancelled subscription:', { subscriptionId });

      // Find subscription by provider subscription ID
      const subscription = await this.prisma.subscription.findFirst({
        where: { providerSubscriptionId: subscriptionId },
        include: { user: true, plan: true },
      });

      // If subscription doesn't exist in our database, log and return success
      if (!subscription) {
        console.log(
          'Subscription not found in database for provider ID (may be from previous/external subscription):',
          subscriptionId,
        );
        return {
          success: true,
          message: 'Subscription not found in database, no action taken',
        };
      }

      // Update subscription status to CANCELLED
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'CANCELED' },
      });

      // Send cancellation email
      await this.sendSubscriptionCancellationEmail(
        subscription.user,
        subscription.plan,
      );

      console.log(
        'Successfully processed subscription cancellation for user:',
        subscription.userId,
      );
      return {
        success: true,
        message: 'Subscription cancellation processed successfully',
      };
    } catch (error) {
      console.error('Error processing subscription cancellation:', error);
      return {
        success: false,
        error:
          error.message ||
          error.toString() ||
          'Failed to process subscription cancellation',
      };
    }
  }

  private async handlePaymentFailure(data: any) {
    try {
      const paymentId = data.payload.payment.entity.id;
      const orderId = data.payload.payment.entity.order_id;
      const amount = data.payload.payment.entity.amount;
      const email = data.payload.payment.entity.email;
      const errorCode = data.payload.payment.entity.error_code;
      const errorDescription = data.payload.payment.entity.error_description;

      console.log('Processing failed payment:', {
        paymentId,
        orderId,
        amount,
        email,
        errorCode,
        errorDescription,
      });

      // Find user by email
      const user = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        console.error('User not found for email:', email);
        return { success: false, error: 'User not found' };
      }

      // Send failure email
      await this.sendPaymentFailureEmail(
        user,
        amount,
        errorCode,
        errorDescription,
      );

      console.log('Successfully processed payment failure for user:', user.id);
      return {
        success: true,
        message: 'Payment failure processed successfully',
      };
    } catch (error) {
      console.error('Error processing payment failure:', error);
      return {
        success: false,
        error:
          error.message ||
          error.toString() ||
          'Failed to process payment failure',
      };
    }
  }

  private async markEmailAsUsed(email: string): Promise<void> {
    try {
      // Use the auth service's markEmailAsUsed method to ensure consistency
      await this.authService.markEmailAsUsed(email);
      console.log('Successfully marked email as used:', email);
    } catch (error) {
      console.error('Error marking email as used:', error);
      // Re-throw the error so it can be handled upstream
      throw error;
    }
  }

  private async sendPaymentSuccessEmail(
    user: any,
    plan: any,
    amount: number,
    isFreeTrial: boolean,
  ) {
    try {
      await this.emailService.sendPaymentSuccessEmail(
        user.email,
        plan.name,
        amount,
        isFreeTrial,
      );
    } catch (error) {
      console.error('Failed to send payment success email:', error);
    }
  }

  private async sendSubscriptionCancellationEmail(user: any, plan: any) {
    try {
      await this.emailService.sendSubscriptionCancellationEmail(
        user.email,
        plan.name,
      );
    } catch (error) {
      console.error('Failed to send subscription cancellation email:', error);
    }
  }

  private async sendPaymentFailureEmail(
    user: any,
    amount: number,
    errorCode: string,
    errorDescription: string,
  ) {
    try {
      await this.emailService.sendPaymentFailureEmail(
        user.email,
        amount,
        errorCode,
        errorDescription,
      );
    } catch (error) {
      console.error('Failed to send payment failure email:', error);
    }
  }

  // Check if user is eligible for free trial
  async isEligibleForFreeTrial(email: string): Promise<boolean> {
    try {
      console.log('Checking free trial eligibility by email:', { email });

      // First check if user has any existing subscriptions
      const user = await this.prisma.user.findUnique({
        where: { email },
        include: {
          subscriptions: true,
        },
      });

      // If user has existing subscriptions, they're not eligible for free trial
      if (user && user.subscriptions && user.subscriptions.length > 0) {
        console.log(
          'User has existing subscriptions, not eligible for free trial:',
          { email },
        );
        return false;
      }

      // Use the auth service to check email-based eligibility
      const eligibility = await this.authService.checkEligibility(email);
      console.log('Email-based eligibility check result:', eligibility);

      return eligibility.isEligible;
    } catch (error) {
      console.error('Error checking free trial eligibility:', error);
      return false; // Default to not eligible if there's an error
    }
  }

  // Public method to mark email as used for free trial testing
  async markEmailAsUsedForTesting(email: string): Promise<void> {
    try {
      // Use the auth service's markEmailAsUsed method to ensure consistency
      await this.authService.markEmailAsUsed(email);
      // console.log('Successfully marked email as used for testing:', email);
    } catch (error) {
      // console.error('Error marking email as used for testing:', error);
      // Re-throw the error so it can be handled upstream
      throw error;
    }
  }

  // Public method to update account type for testing
  async updateAccountTypeForTesting(
    userId: string,
    accountType: any,
  ): Promise<any> {
    try {
      const user = await this.usersService.updateAccountType(
        userId,
        accountType,
      );
      console.log('Successfully updated account type for testing:', {
        userId,
        accountType,
      });
      return user;
    } catch (error) {
      console.error('Error updating account type for testing:', error);
      // Re-throw the error so it can be handled upstream
      throw error;
    }
  }

  private async handleSubscriptionAuthorized(data: any) {
    try {
      const event = data.event;
      const subscription = data.payload.subscription.entity;

      if (
        event !== 'subscription.authorized' &&
        !(
          event === 'subscription.updated' &&
          subscription.status === 'authorized'
        )
      ) {
        return { success: true };
      }

      console.log(`Processing subscription authorization: ${subscription.id}`);

      // Extract email in proper order
      let email =
        subscription.notes?.email ||
        subscription.customer_email || // MOST IMPORTANT
        data.payload.payment?.entity?.email ||
        null;

      if (!email) {
        console.log(
          `Email not found in subscription payload, checking local database...`,
        );

        const existingSub = await this.prisma.subscription.findFirst({
          where: { providerSubscriptionId: subscription.id },
          include: { user: true },
        });

        if (existingSub?.user?.email) {
          email = existingSub.user.email;
        }
      }

      if (!email) {
        console.warn(
          `Could not find email for subscription: ${subscription.id}`,
        );
        return { success: true };
      }

      // Do NOT activate on authorization. Only mark trial eligibility as used if email present.
      if (email) {
        try {
          await this.markEmailAsUsed(email);
        } catch {}
      }
      return { success: true, message: 'Authorization acknowledged' };
    } catch (error) {
      console.error('Error processing subscription authorization:', error);
      return { success: true };
    }
  }

  // Method to get all subscribed users
  async getAllSubscribedUsers() {
    try {
      // Find all subscriptions with active status and include user and plan details
      const subscriptions = await this.prisma.subscription.findMany({
        where: {
          status: 'ACTIVE',
        },
        include: {
          user: true,
          plan: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      // Map the subscriptions to include relevant information
      return subscriptions.map((subscription) => ({
        id: subscription.id,
        status: subscription.status,
        startedAt: subscription.startedAt,
        expiresAt: subscription.expiresAt,
        autoRenew: subscription.autoRenew,
        createdAt: subscription.createdAt,
        user: {
          id: subscription.user.id,
          fullName: subscription.user.fullName,
          email: subscription.user.email,
          accountType: subscription.user.accountType,
          status: subscription.user.status,
        },
        plan: {
          id: subscription.plan.id,
          code: subscription.plan.code,
          name: subscription.plan.name,
          price: subscription.plan.price,
          currency: subscription.plan.currency,
          billingCycle: subscription.plan.billingCycle,
        },
      }));
    } catch (error) {
      console.error('Error fetching subscribed users:', error);
      throw error;
    }
  }

  async getActiveSubscribersDetailed() {
    const subscriptions = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE' },
      include: { user: true, plan: true },
      orderBy: { createdAt: 'desc' },
    });

    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    const items = await Promise.all(
      subscriptions.map(async (s) => {
        const start = new Date(s.startedAt);
        const end = new Date(s.expiresAt);
        const days = Math.max(Math.ceil((end.getTime() - now) / DAY_MS), 0);
        const cycle =
          end.getTime() - start.getTime() >= 300 * DAY_MS
            ? 'ANNUAL'
            : 'MONTHLY';
        const amountPaise =
          this.computeExpectedAmountPaise(s.plan.code, cycle) ||
          s.plan.price ||
          0;
        const displayName =
          s.plan.code === 'PRO_PRIME-X'
            ? 'PRO PRIME-X'
            : s.plan.code === 'PRO'
              ? 'PRO'
              : s.plan.name;
        const isFreeTrial = await this.computeIsFreeTrial(s);

        return {
          subscriptionId: s.id,
          status: s.status,
          startedAt: s.startedAt,
          expiresAt: s.expiresAt,
          daysRemaining: days,
          autoRenew: s.autoRenew,
          paymentProvider: s.paymentProvider,
          providerSubscriptionId: s.providerSubscriptionId,
          providerPaymentId: s.providerPaymentId,
          amountPaise,
          user: {
            id: s.user.id,
            fullName: s.user.fullName,
            email: s.user.email,
            accountType: s.user.accountType,
            status: s.user.status,
          },
          plan: {
            id: s.plan.id,
            code: s.plan.code,
            name: s.plan.name,
            displayName,
            currency: s.plan.currency,
            billingCycle: cycle,
          },
          isFreeTrial,
        };
      }),
    );

    return { success: true, count: items.length, subscribers: items };
  }

  async verifyAutopayStatus(userId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { plan: true, user: true },
    });

    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    if (!subscription) {
      return {
        success: true,
        hasActiveLocalSubscription: false,
        local: null,
        provider: { success: false, found: false },
        shouldRestrict: true,
      };
    }

    const end = new Date(subscription.expiresAt);
    const daysRemaining = Math.max(
      Math.ceil((end.getTime() - now) / DAY_MS),
      0,
    );

    let provider: any = { success: false, found: false };
    if (subscription.providerSubscriptionId) {
      const fetchRes = await this.billingService.getProviderSubscription(
        subscription.providerSubscriptionId,
      );
      provider = fetchRes.success
        ? { success: true, found: true, provider: fetchRes.provider }
        : { success: false, found: false, error: fetchRes.error };
    }

    const providerStatus = provider?.provider?.status;
    const isAutopayCancelled = providerStatus
      ? providerStatus.toLowerCase() === 'cancelled' ||
        providerStatus.toLowerCase() === 'halted' ||
        providerStatus.toLowerCase() === 'paused'
      : false;

    const isFreeTrial = await this.computeIsFreeTrial(subscription);

    return {
      success: true,
      hasActiveLocalSubscription: true,
      local: {
        status: subscription.status,
        autoRenew: subscription.autoRenew,
        startedAt: subscription.startedAt,
        expiresAt: subscription.expiresAt,
        daysRemaining,
        plan: {
          code: subscription.plan.code,
          name: subscription.plan.name,
        },
        isFreeTrial,
        providerSubscriptionId: subscription.providerSubscriptionId,
      },
      provider,
      isAutopayCancelled,
      shouldRestrict: isAutopayCancelled,
    };
  }
}
