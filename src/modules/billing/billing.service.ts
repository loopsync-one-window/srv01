import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import Razorpay from 'razorpay';

@Injectable()
export class BillingService {
  private razorpay: Razorpay;
  private ledger: Array<any> = [];
  private usageHistory: Array<any> = [];

  constructor(
    private configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const keyId = this.configService.get<string>('razorpay.keyId');
    const keySecret = this.configService.get<string>('razorpay.keySecret');

    console.log('Razorpay credentials:', {
      keyId,
      keySecret: keySecret ? '****' : 'NOT SET',
    });

    if (!keyId || !keySecret) {
      throw new Error('Razorpay credentials not configured properly');
    }

    this.razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }

  getRazorpay() {
    return this.razorpay;
  }

  async getPaymentDetails(paymentId: string) {
    try {
      const payment = await this.razorpay.payments.fetch(paymentId);
      return { success: true, payment };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getSubscriptionDetails(subscriptionId: string) {
    try {
      const subscription = await this.razorpay.subscriptions.fetch(subscriptionId);
      return { success: true, subscription };
    } catch (error) {
      return { success: false, error: error.message };
    }
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

  private deriveCycleFromDates(start: Date, end: Date): 'MONTHLY' | 'ANNUAL' {
    const ms = end.getTime() - start.getTime();
    const days = Math.max(Math.floor(ms / (24 * 60 * 60 * 1000)), 0);
    return days >= 300 ? 'ANNUAL' : 'MONTHLY';
  }

  private async ensureFeature(key: string, label: string) {
    let feature = await (this.prisma as any).feature.findUnique({
      where: { key },
    });
    if (!feature) {
      feature = await (this.prisma as any).feature.create({
        data: { key, label, dataType: 'NUMBER' },
      });
    }
    return feature;
  }

  private async getUserNumberOverride(
    userId: string,
    key: string,
    defaultValue: number,
  ) {
    const feature = await this.ensureFeature(key, key.replace(/_/g, ' '));
    const override = await (this.prisma as any).userFeatureOverride.findUnique({
      where: { userId_featureId: { userId, featureId: feature.id } },
    });
    if (override && typeof override.value === 'number') return override.value;
    return defaultValue;
  }

  private async setUserNumberOverride(
    userId: string,
    key: string,
    label: string,
    value: number,
  ) {
    const feature = await this.ensureFeature(key, label);
    const existing = await (this.prisma as any).userFeatureOverride.findUnique({
      where: { userId_featureId: { userId, featureId: feature.id } },
    });
    if (existing) {
      await (this.prisma as any).userFeatureOverride.update({
        where: { id: existing.id },
        data: { value },
      });
    } else {
      await (this.prisma as any).userFeatureOverride.create({
        data: { userId, featureId: feature.id, value },
      });
    }
  }

  private async setBalance(
    userId: string,
    kind: 'prepaid' | 'free',
    value: number,
  ) {
    const key = kind === 'prepaid' ? 'CREDITS_PREPAID' : 'CREDITS_FREE';
    await this.setUserNumberOverride(
      userId,
      key,
      key.replace(/_/g, ' '),
      value,
    );
  }

  async getOverview(userId: string) {
    const subscription = await (this.prisma as any).subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { plan: true },
    });
    const prepaid = await this.getUserNumberOverride(
      userId,
      'CREDITS_PREPAID',
      0,
    );
    const free = await this.getUserNumberOverride(userId, 'CREDITS_FREE', 0);
    const used = await this.getUserNumberOverride(userId, 'USAGE_USED', 0);
    const prepaidUsed = await this.getUserNumberOverride(
      userId,
      'USAGE_PREPAID_USED',
      0,
    );
    const totalCap = prepaid + free;
    const remainingCap = Math.max(0, totalCap - used);
    const daysRemaining = subscription
      ? Math.max(
        0,
        Math.ceil(
          ((new Date(subscription.expiresAt) as any) - (new Date() as any)) /
          (24 * 60 * 60 * 1000),
        ),
      )
      : 0;
    return {
      success: true,
      data: {
        subscription: subscription
          ? {
            planName: subscription.plan.name,
            status: subscription.status,
            startDate: subscription.startedAt,
            endDate: subscription.expiresAt,
            daysRemaining,
            autoRenew: subscription.autoRenew,
          }
          : null,
        credits: {
          prepaid: { balance: Number(prepaid.toFixed(2)) },
          free: { balance: Number(free.toFixed(2)) },
          usageCap: {
            total: Number(totalCap.toFixed(2)),
            remaining: Number(remainingCap.toFixed(2)),
          },
        },
        usage: {
          total: Number(used.toFixed(2)),
          prepaidUsed: Number(prepaidUsed.toFixed(2)),
        },
        nextInvoice: subscription
          ? Number(
            (
              this.computeExpectedAmountPaise(
                subscription.plan.code,
                this.deriveCycleFromDates(
                  subscription.startedAt,
                  subscription.expiresAt,
                ),
              ) || subscription.plan.price
            ).toFixed(2),
          )
          : 0,
      },
    };
  }

  async getCreditsByUserId(userId: string) {
    const user = await (this.prisma as any).user.findUnique({
      where: { id: userId },
    });
    const prepaid = await this.getUserNumberOverride(
      userId,
      'CREDITS_PREPAID',
      0,
    );
    const free = await this.getUserNumberOverride(userId, 'CREDITS_FREE', 0);
    return {
      success: true,
      data: {
        email: user?.email || null,
        credits: {
          prepaid: Number(prepaid.toFixed(2)),
          free: Number(free.toFixed(2)),
        },
      },
    };
  }

  async getCreditLedger(email?: string) {
    const items = email
      ? this.ledger.filter((l) => l.email === email)
      : this.ledger;
    return { success: true, data: items };
  }

  async getUsageHistory(email?: string) {
    const items = email
      ? this.usageHistory.filter((u) => u.email === email)
      : this.usageHistory;
    return { success: true, data: items };
  }

  async addCredits(payload: {
    email: string;
    type: 'prepaid' | 'free';
    amount: number;
    reason: string;
    referenceId: string;
  }) {
    const user = await (this.prisma as any).user.findUnique({
      where: { email: payload.email },
    });
    if (!user) return { success: false, message: 'User not found' };
    let prepaid = await this.getUserNumberOverride(
      user.id,
      'CREDITS_PREPAID',
      0,
    );
    let free = await this.getUserNumberOverride(user.id, 'CREDITS_FREE', 0);
    if (payload.type === 'prepaid') prepaid = prepaid + payload.amount;
    else free = free + payload.amount;
    await this.setBalance(user.id, 'prepaid', prepaid);
    await this.setBalance(user.id, 'free', free);
    this.ledger.push({
      id: `ledger_${Date.now()}`,
      email: payload.email,
      type: payload.type,
      direction: 'credit',
      amount: payload.amount,
      reason: payload.reason,
      source: 'admin',
      referenceId: payload.referenceId,
      createdAt: new Date().toISOString(),
    });
    return {
      success: true,
      data: {
        added: payload.amount,
        balances: {
          prepaid: Number(prepaid.toFixed(2)),
          free: Number(free.toFixed(2)),
        },
      },
    };
  }

  async addTrialCredits(payload: {
    email: string;
    type: 'prepaid' | 'free';
    amount: number;
    reason: string;
    referenceId: string;
  }) {
    const user = await (this.prisma as any).user.findUnique({
      where: { email: payload.email },
    });
    if (!user) return { success: false, message: 'User not found' };

    if (user.trialCreditsClaimed) {
      return { success: false, message: 'Trial credits already claimed', code: 'ALREADY_CLAIMED' };
    }

    const result = await this.addCredits(payload);

    if (result.success) {
      await (this.prisma as any).user.update({
        where: { id: user.id },
        data: { trialCreditsClaimed: true },
      });
    }

    return result;
  }

  async getTrialCreditsStatus(userId: string) {
    const user = await (this.prisma as any).user.findUnique({
      where: { id: userId },
      select: { trialCreditsClaimed: true },
    });
    return { success: true, claimed: user?.trialCreditsClaimed || false };
  }

  async deductCredits(payload: {
    email: string;
    amount: number;
    deductFrom: 'auto' | 'prepaid' | 'free';
    reason: string;
    referenceId: string;
  }) {
    const user = await (this.prisma as any).user.findUnique({
      where: { email: payload.email },
    });
    if (!user) return { success: false, message: 'User not found' };
    let prepaid = await this.getUserNumberOverride(
      user.id,
      'CREDITS_PREPAID',
      0,
    );
    let free = await this.getUserNumberOverride(user.id, 'CREDITS_FREE', 0);
    let remaining = payload.amount;
    if (payload.deductFrom === 'prepaid') {
      if (prepaid <= 0 || prepaid < remaining) {
        return {
          success: false,
          error: 'INSUFFICIENT_PREPAID_CREDITS',
          message: 'Prepaid credits are insufficient for requested deduction.',
        };
      }
      prepaid = prepaid - remaining;
    } else if (payload.deductFrom === 'free') {
      if (free <= 0 || free < remaining) {
        return {
          success: false,
          error: 'INSUFFICIENT_FREE_CREDITS',
          message: 'Free credits are insufficient for requested deduction.',
        };
      }
      free = free - remaining;
    } else {
      const fromPrepaid = Math.min(prepaid, remaining);
      prepaid -= fromPrepaid;
      remaining -= fromPrepaid;
      if (remaining > 0) free = Math.max(0, free - remaining);
    }
    await this.setBalance(user.id, 'prepaid', prepaid);
    await this.setBalance(user.id, 'free', free);
    this.ledger.push({
      id: `ledger_${Date.now()}`,
      email: payload.email,
      type: payload.deductFrom === 'free' ? 'free' : 'prepaid',
      direction: 'debit',
      amount: payload.amount,
      reason: payload.reason,
      source: 'admin',
      referenceId: payload.referenceId,
      createdAt: new Date().toISOString(),
    });
    return {
      success: true,
      data: {
        deducted: payload.amount,
        balances: {
          prepaid: Number(prepaid.toFixed(2)),
          free: Number(free.toFixed(2)),
        },
      },
    };
  }

  async consumeCredits(payload: {
    email: string;
    cost: number;
    resource: string;
    requestId: string;
  }) {
    const user = await (this.prisma as any).user.findUnique({
      where: { email: payload.email },
    });
    if (!user) return { success: false, error: 'User not found' };
    let prepaid = await this.getUserNumberOverride(
      user.id,
      'CREDITS_PREPAID',
      0,
    );
    let free = await this.getUserNumberOverride(user.id, 'CREDITS_FREE', 0);

    // Detect free trial status
    const subscription = await (this.prisma as any).subscription.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { plan: true, user: true },
    });
    if (!subscription)
      return {
        success: false,
        error: 'SUBSCRIPTION_INACTIVE',
        message:
          'Your subscription is inactive or cancelled. Please renew to continue.',
      };
    let isFreeTrial = false;
    try {
      const planCode = subscription?.plan?.code;
      const userEmail = subscription?.user?.email;
      if (planCode === 'PRO' && userEmail) {
        const eligible = await (this.prisma as any).eligibleEmail.findUnique({
          where: { email: userEmail },
        });
        if (eligible && eligible.isUsed === true) {
          const startedAt = new Date(subscription.startedAt).getTime();
          const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
          isFreeTrial = Date.now() - startedAt <= sevenDaysMs;
        }
      }
    } catch { }

    let fromFree = 0;
    let fromPrepaid = 0;
    let remaining = payload.cost;

    if (isFreeTrial) {
      // During free trial: only consume free credits; do not touch prepaid
      if (free < payload.cost) {
        return {
          success: false,
          error: 'USAGE_LIMIT_REACHED',
          message:
            'Your 7-day free trial credits are exhausted. Please add more credits or wait until the trial period ends.',
        };
      }
      fromFree = Math.min(free, remaining);
      free = Math.max(0, free - fromFree);
      remaining -= fromFree;
    } else {
      // Normal: consume free first, then prepaid
      const total = prepaid + free;
      if (total < payload.cost) {
        return {
          success: false,
          error: 'USAGE_LIMIT_REACHED',
          message:
            'Your subscription credits are exhausted. Please add credits to continue.',
        };
      }
      fromFree = Math.min(free, remaining);
      free -= fromFree;
      remaining -= fromFree;
      if (remaining > 0) {
        fromPrepaid = Math.min(prepaid, remaining);
        prepaid -= fromPrepaid;
        remaining -= fromPrepaid;
      }
    }

    await this.setBalance(user.id, 'prepaid', prepaid);
    await this.setBalance(user.id, 'free', free);
    const used = await this.getUserNumberOverride(user.id, 'USAGE_USED', 0);
    await this.setUserNumberOverride(
      user.id,
      'USAGE_USED',
      'USAGE USED',
      used + payload.cost,
    );
    const prepaidUsed = await this.getUserNumberOverride(
      user.id,
      'USAGE_PREPAID_USED',
      0,
    );
    await this.setUserNumberOverride(
      user.id,
      'USAGE_PREPAID_USED',
      'USAGE PREPAID USED',
      prepaidUsed + fromPrepaid,
    );
    this.ledger.push({
      id: `ledger_${Date.now()}`,
      email: payload.email,
      type: fromPrepaid > 0 ? 'prepaid' : 'free',
      direction: 'debit',
      amount: payload.cost,
      reason: `usage:${payload.resource}`,
      source: 'system',
      referenceId: payload.requestId,
      createdAt: new Date().toISOString(),
    });
    this.usageHistory.push({
      email: payload.email,
      resource: payload.resource,
      cost: Number(payload.cost.toFixed(2)),
      requestId: payload.requestId,
      createdAt: new Date().toISOString(),
    });
    return {
      success: true,
      data: {
        deducted: payload.cost,
        balances: {
          prepaid: Number(prepaid.toFixed(2)),
          free: Number(free.toFixed(2)),
        },
      },
    };
  }

  async syncSubscription(userId: string, subscriptionId?: string) {
    const subscription = subscriptionId
      ? await (this.prisma as any).subscription.findUnique({
        where: { id: subscriptionId },
        include: { plan: true },
      })
      : await (this.prisma as any).subscription.findFirst({
        where: { userId, status: 'ACTIVE' },
        include: { plan: true },
      });
    if (!subscription)
      return { success: false, message: 'Subscription not found' };
    const prepaid =
      this.computeExpectedAmountPaise(
        subscription.plan.code,
        this.deriveCycleFromDates(
          subscription.startedAt,
          subscription.expiresAt,
        ),
      ) || subscription.plan.price;
    await this.setBalance(subscription.userId, 'prepaid', prepaid);
    await this.setBalance(subscription.userId, 'free', 0);
    await this.setUserNumberOverride(
      subscription.userId,
      'USAGE_USED',
      'USAGE USED',
      0,
    );
    await this.setUserNumberOverride(
      subscription.userId,
      'USAGE_PREPAID_USED',
      'USAGE PREPAID USED',
      0,
    );
    this.ledger.push({
      id: `ledger_${Date.now()}`,
      email: (
        await (this.prisma as any).user.findUnique({
          where: { id: subscription.userId },
        })
      )?.email,
      type: 'prepaid',
      direction: 'credit',
      amount: prepaid,
      reason: 'Subscription activation',
      source: 'subscription',
      referenceId: subscription.id,
      createdAt: new Date().toISOString(),
    });
    return { success: true, message: 'Billing initialized from subscription' };
  }

  async resetSubscription(userId: string, subscriptionId?: string) {
    const subscription = subscriptionId
      ? await (this.prisma as any).subscription.findUnique({
        where: { id: subscriptionId },
        include: { plan: true },
      })
      : await (this.prisma as any).subscription.findFirst({
        where: { userId, status: 'ACTIVE' },
        include: { plan: true },
      });
    if (!subscription)
      return { success: false, message: 'Subscription not found' };
    const prepaid =
      this.computeExpectedAmountPaise(
        subscription.plan.code,
        this.deriveCycleFromDates(
          subscription.startedAt,
          subscription.expiresAt,
        ),
      ) || subscription.plan.price;
    await this.setBalance(subscription.userId, 'prepaid', prepaid);
    await this.setBalance(subscription.userId, 'free', 0);
    await this.setUserNumberOverride(
      subscription.userId,
      'USAGE_USED',
      'USAGE USED',
      0,
    );
    await this.setUserNumberOverride(
      subscription.userId,
      'USAGE_PREPAID_USED',
      'USAGE PREPAID USED',
      0,
    );
    this.ledger.push({
      id: `ledger_${Date.now()}`,
      email: (
        await (this.prisma as any).user.findUnique({
          where: { id: subscription.userId },
        })
      )?.email,
      type: 'prepaid',
      direction: 'credit',
      amount: prepaid,
      reason: 'Subscription renewal',
      source: 'subscription',
      referenceId: subscription.id,
      createdAt: new Date().toISOString(),
    });
    return { success: true, message: 'Subscription balances reset' };
  }

  async getBillingDetails(userId: string) {
    const subscription = await (this.prisma as any).subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { plan: true, user: true },
    });

    let defaultPaymentMethod = await (
      this.prisma as any
    ).paymentMethod.findFirst({
      where: { userId, isDefault: true },
    });
    if (!defaultPaymentMethod) {
      defaultPaymentMethod = await (this.prisma as any).paymentMethod.findFirst(
        {
          where: { userId },
          orderBy: { createdAt: 'desc' },
        },
      );
    }

    let defaultBillingAddress = await (
      this.prisma as any
    ).billingAddress.findFirst({
      where: { userId, isDefault: true },
    });
    if (!defaultBillingAddress) {
      defaultBillingAddress = await (
        this.prisma as any
      ).billingAddress.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
    }

    const displayName = subscription
      ? subscription.plan.code === 'PRO_PRIME-X'
        ? 'PRO PRIME-X'
        : subscription.plan.code === 'PRO'
          ? 'PRO'
          : subscription.plan.name
      : null;

    return {
      activePlan: displayName,
      startDate: subscription ? subscription.startedAt : null,
      endDate: subscription ? subscription.expiresAt : null,
      amount: subscription
        ? this.computeExpectedAmountPaise(
          subscription.plan.code,
          this.deriveCycleFromDates(
            subscription.startedAt,
            subscription.expiresAt,
          ),
        ) || subscription.plan.price
        : null,
      currency: subscription ? subscription.plan.currency : null,
      billingEmail: subscription ? subscription.user.email : null,
      billingAddress: defaultBillingAddress
        ? {
          id: defaultBillingAddress.id,
          addressLine1: defaultBillingAddress.addressLine1,
          addressLine2: defaultBillingAddress.addressLine2,
          city: defaultBillingAddress.city,
          state: defaultBillingAddress.state,
          country: defaultBillingAddress.country,
          pinCode: defaultBillingAddress.pinCode,
          phoneNumber: defaultBillingAddress.phoneNumber,
        }
        : null,
      paymentMethod: defaultPaymentMethod
        ? {
          id: defaultPaymentMethod.id,
          type: defaultPaymentMethod.type,
          providerDetails: defaultPaymentMethod.providerDetails,
        }
        : null,
      paymentId: subscription ? subscription.providerPaymentId : null,
    };
  }

  // -------------------------------------------------------
  // Create Razorpay Order
  // -------------------------------------------------------
  async createOrder(
    amount: number,
    currency: string,
    receipt: string,
    notes?: Record<string, string>,
  ) {
    console.log('Received createOrder() inputs:', {
      amount,
      currency,
      receipt,
      notes,
    });

    // Validate amount (must be an integer in paise)
    if (!amount || amount <= 0 || typeof amount !== 'number') {
      throw new Error(
        `Invalid amount received: ${amount}. Must be a positive number in paise.`,
      );
    }

    // Ensure amount is integer (Razorpay requires integer in paise)
    amount = Math.round(amount);

    if (!currency) throw new Error('Currency is required');
    if (!receipt) throw new Error('Receipt is required');

    const options = {
      amount,
      currency,
      receipt,
      notes,
    };

    console.log('Sending order to Razorpay:', options);

    try {
      const order = await this.razorpay.orders.create(options);
      console.log('Razorpay order created successfully:', order);
      return order;
    } catch (error) {
      // Log RAW error for debugging
      console.error('RAW Razorpay Error:', JSON.stringify(error, null, 2));

      const message =
        error?.error?.description ||
        error?.error?.reason ||
        error?.message ||
        error?.toString() ||
        'Unknown Razorpay error';

      throw new Error(`Failed to create Razorpay order: ${message}`);
    }
  }

  // -------------------------------------------------------
  // Create Razorpay Subscription Plan
  // -------------------------------------------------------
  async createSubscriptionPlan(
    planId: string,
    amount: number,
    currency: string,
    interval: 'monthly' | 'yearly',
    name: string,
    description: string,
  ) {
    console.log('Creating subscription plan:', {
      planId,
      amount,
      currency,
      interval,
      name,
      description,
    });

    try {
      const plan = await this.razorpay.plans.create({
        period: interval,
        interval: 1,
        item: {
          name,
          amount,
          currency,
          description,
        },
        notes: {
          planId,
        },
      });

      console.log('Razorpay subscription plan created successfully:', plan);
      return plan;
    } catch (error) {
      console.error(
        'Error creating subscription plan:',
        JSON.stringify(error, null, 2),
      );
      throw new Error(`Failed to create subscription plan: ${error.message}`);
    }
  }

  // -------------------------------------------------------
  // Create Razorpay Subscription
  // -------------------------------------------------------
  async createSubscription(
    plan_id: string,
    customer_id: string,
    quantity: number = 1,
    notes?: Record<string, string>,
    start_at?: number, // Add start_at parameter for delayed billing
  ) {
    console.log('Creating subscription:', {
      plan_id,
      customer_id,
      quantity,
      notes,
      start_at,
    });

    try {
      const subscriptionOptions: any = {
        plan_id,
        total_count: 12, // For monthly plans, 12 months
        quantity,
        notes,
        // Removed description field as it's not required for subscription creation
      };

      // Only add customer_id if it's provided
      if (customer_id) {
        subscriptionOptions.customer_id = customer_id;
      }

      // Add start_at if provided for delayed billing
      if (start_at) {
        subscriptionOptions.start_at = start_at;
      }

      const subscription =
        await this.razorpay.subscriptions.create(subscriptionOptions);

      console.log('Razorpay subscription created successfully:', subscription);
      return subscription;
    } catch (error) {
      console.error(
        'Error creating subscription:',
        JSON.stringify(error, null, 2),
      );
      throw new Error(`Failed to create subscription: ${error.message}`);
    }
  }

  // -------------------------------------------------------
  // Cancel Razorpay Subscription
  // -------------------------------------------------------
  async cancelSubscription(
    providerSubscriptionId: string,
    cancelAtCycleEnd = false,
  ) {
    try {
      const result = await this.razorpay.subscriptions.cancel(
        providerSubscriptionId,
        cancelAtCycleEnd,
      );
      console.log(
        'Razorpay subscription cancelled:',
        providerSubscriptionId,
        result,
      );
      return { success: true };
    } catch (error) {
      console.error(
        'Failed to cancel Razorpay subscription:',
        providerSubscriptionId,
        JSON.stringify(error, null, 2),
      );
      return {
        success: false,
        error: error?.message || error?.toString() || 'Cancel failed',
      };
    }
  }

  // -------------------------------------------------------
  // Create Razorpay Subscription with Payment Authorization
  // -------------------------------------------------------
  async createSubscriptionWithAuthorization(
    plan_id: string,
    customer_id: string,
    quantity: number = 1,
    notes?: Record<string, string>,
    start_at?: number, // Add start_at parameter for delayed billing
  ) {
    console.log('Creating subscription with authorization:', {
      plan_id,
      customer_id,
      quantity,
      notes,
      start_at,
    });

    try {
      const subscriptionOptions: any = {
        plan_id,
        total_count: 12, // For monthly plans, 12 months
        quantity,
        notes,
        // Add options for immediate payment processing
        customer_notify: 1, // Notify customer
        // Removed description field as it's not required for subscription creation
      };

      // Only add customer_id if it's provided
      if (customer_id) {
        subscriptionOptions.customer_id = customer_id;
      }

      // Add start_at if provided for delayed billing
      if (start_at) {
        subscriptionOptions.start_at = start_at;
      }

      const subscription =
        await this.razorpay.subscriptions.create(subscriptionOptions);

      console.log(
        'Razorpay subscription with authorization created successfully:',
        subscription,
      );
      return subscription;
    } catch (error) {
      console.error(
        'Error creating subscription with authorization:',
        JSON.stringify(error, null, 2),
      );
      throw new Error(
        `Failed to create subscription with authorization: ${error.message || error.toString()}`,
      );
    }
  }

  async getProviderSubscription(providerSubscriptionId: string) {
    try {
      const sub = await (this.razorpay as any).subscriptions.fetch(
        providerSubscriptionId,
      );
      return {
        success: true,
        provider: {
          id: sub?.id,
          status: sub?.status,
          total_count: sub?.total_count,
          paid_count: sub?.paid_count,
          current_start: sub?.current_start,
          current_end: sub?.current_end,
          charge_at: sub?.charge_at,
          start_at: sub?.start_at,
          end_at: sub?.end_at,
          pause_at: sub?.pause_at,
          resume_at: sub?.resume_at,
          customer_id: sub?.customer_id,
          plan_id: sub?.plan_id,
          notes: sub?.notes,
          addon_data: sub?.addons,
          auth_attempted: sub?.has_succeeded,
          auth_failure_reason: sub?.payment_failed_reason,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error?.message || error?.toString() || 'FETCH_FAILED',
      };
    }
  }

  // -------------------------------------------------------
  // Create Razorpay Customer
  // -------------------------------------------------------
  async createCustomer(
    name: string,
    email: string,
    contact: string,
    notes?: Record<string, string>,
  ) {
    console.log('Creating customer:', { name, email, contact, notes });

    try {
      // First, try to find existing customer by email
      try {
        const customers = await this.razorpay.customers.all({
          count: 100, // Fetch up to 100 customers
        });

        // Look for existing customer with same email
        const existingCustomer = customers.items?.find(
          (customer: any) => customer.email === email,
        );

        if (existingCustomer) {
          console.log('Found existing customer:', existingCustomer);
          return existingCustomer;
        }
      } catch (searchError) {
        console.log(
          'Could not search for existing customers, will create new one:',
          searchError,
        );
      }

      // If no existing customer found, create a new one
      const customer = await this.razorpay.customers.create({
        name,
        email,
        contact,
        notes,
      });

      console.log('Razorpay customer created successfully:', customer);
      return customer;
    } catch (error) {
      // If customer already exists, try to find it
      if (
        error.statusCode === 400 &&
        error.error?.description?.includes('Customer already exists')
      ) {
        try {
          // Try to fetch the customer by email
          const customers = await this.razorpay.customers.all({
            count: 100,
          });

          const existingCustomer = customers.items?.find(
            (customer: any) => customer.email === email,
          );

          if (existingCustomer) {
            console.log(
              'Found existing customer after creation error:',
              existingCustomer,
            );
            return existingCustomer;
          }
        } catch (searchError) {
          console.log(
            'Error searching for customer after creation error:',
            searchError,
          );
        }
      }

      console.error('Error creating customer:', JSON.stringify(error, null, 2));
      throw new Error(`Failed to create customer: ${error.message}`);
    }
  }

  // -------------------------------------------------------
  // Payment Signature Verification
  // -------------------------------------------------------
  async verifyPayment(paymentId: string, orderId: string, signature: string) {
    try {
      const crypto = require('crypto');
      const secret = this.configService.get<string>('razorpay.keySecret');
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(orderId + '|' + paymentId);
      const digest = hmac.digest('hex');
      return digest === signature;
    } catch (error) {
      throw new Error(`Failed to verify payment: ${error.message}`);
    }
  }

  // -------------------------------------------------------
  // Main Processing Function for One-time Payments
  // -------------------------------------------------------
  async processPayment(data: any) {
    console.log('Processing payment request:', data);

    try {
      if (!data.amount && data.amount !== 0) {
        return { success: false, error: 'Amount is required' };
      }

      if (!data.currency) {
        return { success: false, error: 'Currency is required' };
      }

      // The amount should already be in paise from the plan data
      // Ensure it's an integer
      data.amount = Math.round(data.amount);

      const order = await this.createOrder(
        data.amount,
        data.currency,
        data.receipt || `receipt_${Date.now()}`,
        {
          email: data.email,
          planCode: data.planCode,
          userId: data.userId,
        },
      );

      return {
        success: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
      };
    } catch (error) {
      console.error('Order creation failed:', JSON.stringify(error, null, 2));

      return {
        success: false,
        error:
          error?.message ||
          error?.error?.description ||
          error?.toString() ||
          'Unknown Razorpay error',
      };
    }
  }

  // -------------------------------------------------------
  // Main Processing Function for Recurring Payments
  // -------------------------------------------------------
  async processRecurringPayment(data: any) {
    console.log('Processing recurring payment request:', data);

    try {
      // Validate required fields
      if (!data.amount && data.amount !== 0) {
        return { success: false, error: 'Amount is required' };
      }

      if (!data.currency) {
        return { success: false, error: 'Currency is required' };
      }

      if (!data.billingCycle) {
        return { success: false, error: 'Billing cycle is required' };
      }

      if (!data.email) {
        return { success: false, error: 'Email is required' };
      }

      if (!data.userId) {
        return { success: false, error: 'User ID is required' };
      }

      // Ensure amount is an integer in paise
      data.amount = Math.round(data.amount);

      // Create or find customer in Razorpay
      let customer;
      try {
        customer = await this.createCustomer(
          data.fullName || 'Customer',
          data.email,
          data.contact || '',
          {
            userId: data.userId,
          },
        );
      } catch (customerError) {
        console.error('Failed to create/find customer:', customerError);
        return {
          success: false,
          error: `Failed to create customer: ${customerError.message || customerError.toString()}`,
        };
      }

      // Create subscription plan in Razorpay with the actual plan amount
      // Do NOT override the amount for free trials
      const planName = `${data.planCode} ${data.billingCycle} Plan`;
      const planDescription = `${data.planCode} ${data.billingCycle} subscription plan`;

      const plan = await this.createSubscriptionPlan(
        `${data.planCode}_${data.billingCycle}_${Date.now()}`,
        data.amount, // Use the actual plan amount, not ₹2
        data.currency,
        data.billingCycle === 'ANNUAL' ? 'yearly' : 'monthly',
        planName,
        planDescription,
      );

      console.log('Created plan:', plan);

      // Calculate start_at for 7-day delay if this is a free trial
      let start_at: number | undefined;
      if (data.isFreeTrial) {
        // Delay billing by 7 days (7 days * 24 hours * 60 minutes * 60 seconds)
        start_at = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
      }

      // Create subscription with immediate authorization
      // This will redirect the customer to complete the payment
      const subscription = await this.createSubscriptionWithAuthorization(
        plan.id,
        customer.id,
        1,
        {
          email: data.email,
          planCode: data.planCode,
          userId: data.userId,
          billingCycle: data.billingCycle,
          ...(data.isFreeTrial ? { trialDays: '7' } : {}), // Add trial days info if applicable
        },
        start_at, // Pass the start_at for delayed billing
      );

      console.log('Created subscription object:', subscription);

      // For popup checkout, we only need to return the subscriptionId
      return {
        success: true,
        subscriptionId: subscription.id,
        planCode: data.planCode,
        email: data.email,
        userId: data.userId,
        billingCycle: data.billingCycle,
        isRecurring: true,
        amount: data.amount, // Return the actual plan amount, not ₹2
        currency: data.currency,
      };
    } catch (error) {
      console.error(
        'Recurring payment processing failed:',
        JSON.stringify(error, null, 2),
      );

      return {
        success: false,
        error:
          error?.message ||
          error?.error?.description ||
          error?.toString() ||
          'Unknown Razorpay error',
      };
    }
  }

  // -------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------
  async handleWebhook(data: any, signature: string) {
    try {
      // Verify webhook signature
      const crypto = require('crypto');
      const webhookSecret = this.configService.get<string>(
        'razorpay.webhookSecret',
      );

      if (!webhookSecret) {
        throw new Error('Razorpay webhook secret not configured');
      }

      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(data))
        .digest('hex');

      if (expectedSignature !== signature) {
        throw new Error('Invalid webhook signature');
      }

      console.log('Webhook verified successfully');
      return { success: true, data };
    } catch (error) {
      console.error('Webhook verification failed:', error);
      return {
        success: false,
        error:
          error.message || error.toString() || 'Webhook verification failed',
      };
    }
  }
}
