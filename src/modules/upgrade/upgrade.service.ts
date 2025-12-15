import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlansService } from '../plans/plans.service';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class UpgradeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plansService: PlansService,
    private readonly billingService: BillingService,
  ) {}

  private getCycleDays(cycle: 'MONTHLY' | 'ANNUAL') {
    return cycle === 'ANNUAL' ? 365 : 30;
  }

  private getCycleLabel(cycle: 'MONTHLY' | 'ANNUAL') {
    return cycle === 'ANNUAL' ? 'yearly' : 'monthly';
  }

  async computePrepaidCredit(userId: string) {
    const active = await this.prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { plan: true },
    });

    if (!active)
      return {
        creditPaise: 0,
        sourceSubscriptionId: null,
        sourcePlanCode: null,
      };

    const now = new Date();
    const expires = active.expiresAt;
    if (expires <= now) {
      return {
        creditPaise: 0,
        sourceSubscriptionId: active.providerSubscriptionId || null,
        sourcePlanCode: active.plan.code,
      };
    }

    const msLeft = expires.getTime() - now.getTime();
    const daysLeft = Math.max(Math.floor(msLeft / (24 * 60 * 60 * 1000)), 0);
    const totalDays = this.getCycleDays(active.plan.billingCycle);
    const perDayPaise = Math.floor(active.plan.price / totalDays);
    const creditPaise = Math.floor(perDayPaise * daysLeft);

    return {
      creditPaise,
      sourceSubscriptionId: active.providerSubscriptionId || null,
      sourcePlanCode: active.plan.code,
    };
  }

  async createUpgradeSubscription(params: {
    userId: string;
    email: string;
    contact?: string;
    newPlanCode: string;
    billingCycle: 'MONTHLY' | 'ANNUAL';
  }) {
    const plan = await this.plansService.findOneByCode(params.newPlanCode);
    if (!plan) {
      return { success: false, message: 'Plan not found' };
    }

    // Determine price for selected cycle (explicit pricing rules)
    const selectedCycle = params.billingCycle;
    const selectedPricePaise = await this.deriveCyclePrice(plan, selectedCycle);

    // Compute credits from existing active subscription (do NOT delay billing)
    const { creditPaise, sourceSubscriptionId } =
      await this.computePrepaidCredit(params.userId);
    const creditRupees = Math.max(Math.floor(creditPaise) / 100, 0);

    // Create RZP plan and subscription
    const cycleLabel = this.getCycleLabel(selectedCycle);
    const name = `LoopSync ${plan.name} ${cycleLabel}`;
    const description = `LoopSync ${plan.name} subscription (${cycleLabel})`;

    const rzpPlan = await this.billingService.createSubscriptionPlan(
      plan.id,
      selectedPricePaise,
      plan.currency,
      cycleLabel === 'yearly' ? 'yearly' : 'monthly',
      name,
      description,
    );

    const customer = await this.billingService.createCustomer(
      params.email,
      params.email,
      params.contact || '',
      { userId: params.userId },
    );

    const notes = {
      planCode: plan.code,
      userId: params.userId,
      upgradeFromSubscriptionId: sourceSubscriptionId || '',
      billingCycle: selectedCycle,
      creditRupees: String(creditRupees),
    } as Record<string, string>;

    // Create subscription with authorization (no start_at => immediate charge)
    const subscription =
      await this.billingService.createSubscriptionWithAuthorization(
        rzpPlan.id,
        customer.id,
        1,
        notes,
        undefined,
      );

    // Credit rollover: add leftover prepaid credits to user's balance (use paise)
    try {
      if (creditRupees > 0) {
        await this.billingService.addCredits({
          email: params.email,
          type: 'prepaid',
          amount: Math.round(creditRupees * 100),
          reason: 'UPGRADE_ROLLOVER',
          referenceId: sourceSubscriptionId || 'unknown',
        });
      }
    } catch (e) {
      // ignore credit add failure; upgrade proceeds
    }

    // Do NOT activate or cancel anything here.
    // Activation and previous subscription cancellation happen after payment success
    // via webhook or client fallback.

    return {
      success: true,
      subscriptionId: subscription.id,
      amount: selectedPricePaise,
      currency: plan.currency,
      billingCycle: selectedCycle,
      isRecurring: true,
      freeDaysApplied: 0,
    };
  }

  private async deriveCyclePrice(plan: any, cycle: 'MONTHLY' | 'ANNUAL') {
    // Explicit pricing rules to avoid proportional errors
    if (cycle === 'ANNUAL') {
      if (plan.code === 'PRO') return 7399 * 100; // ₹7,399
      if (plan.code === 'PRO_PRIME-X') return 12599 * 100; // ₹12,599
      // Default: 12 months with 10% discount
      return Math.round(plan.price * 12 * 0.9);
    }
    // Monthly: use plan base price
    return plan.price;
  }
}
