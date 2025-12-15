import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Req,
  Headers,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SubscriptionsService } from './subscriptions.service';
import { PlansService } from '../plans/plans.service';
import { BillingService } from '../billing/billing.service';
import { AuthService } from '../auth/auth.service';
import { UsersService } from '../users/users.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly plansService: PlansService,
    private readonly billingService: BillingService,
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async getMySubscription(@Req() req: any) {
    const userId = req.user.id;
    return this.subscriptionsService.getSubscriptionByUserId(userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('autopay-status')
  async verifyAutopayStatus(@Req() req: any) {
    const userId = req.user.id;
    return this.subscriptionsService.verifyAutopayStatus(userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('checkout')
  async createCheckout(@Req() req: any, @Body() data: any) {
    console.log('Checkout request received:', { data, user: req.user });
    const userId = req.user.id;
    const { planCode, email, billingCycle, isRecurring = false } = data;

    // Normalize billing cycle to uppercase to match enum
    const normalizedBillingCycle = billingCycle?.toUpperCase();

    // Get plan details
    const plan = await this.plansService.findOneByCode(planCode);
    if (!plan) {
      return {
        success: false,
        message: `Plan with code '${planCode}' not found`,
      };
    }

    // Validate that the plan is active
    if (!plan.isActive) {
      return {
        success: false,
        message: `Plan '${planCode}' is not currently active`,
      };
    }

    // Validate plan data
    if (!plan.price || plan.price <= 0) {
      return { success: false, message: `Invalid plan price: ${plan.price}` };
    }

    if (!plan.currency) {
      return { success: false, message: 'Plan currency is not set' };
    }

    // Calculate amount based on billing cycle and plan data
    let amount = plan.price; // Default to plan's base price (in paise)
    console.log('Initial amount calculation:', {
      planCode,
      basePrice: plan.price,
      amount,
    });

    // Apply billing cycle pricing based on user selection
    if (normalizedBillingCycle === 'ANNUAL') {
      // User selected annual billing
      // Use predefined annual prices regardless of what's in the database
      // PRO: Monthly ₹759, Annual ₹7,399 (effectively 10.7 months)
      // PRO PRIME-X: Monthly ₹1,299, Annual ₹12,599 (effectively 9.7 months)

      // For PRO plan (code: "PRO")
      if (plan.code === 'PRO') {
        amount = 7399 * 100; // ₹7,399 in paise
      }
      // For PRO PRIME-X plan (code: "PRO_PRIME-X")
      else if (plan.code === 'PRO_PRIME-X') {
        amount = 12599 * 100; // ₹12,599 in paise
      }
      // Fallback calculation (12 months with 10% discount)
      else {
        amount = Math.round(plan.price * 12 * 0.9);
      }
      console.log('Annual pricing applied:', { planCode, amount });
    } else {
      // Use the plan's base price for monthly billing
      amount = plan.price;
      console.log('Monthly pricing applied:', { planCode, amount });
    }

    // Check if user is eligible for free trial
    // Only PRO plan is eligible for free trial
    // For free trial, we still calculate the regular amount but pass isFreeTrial flag
    const isEligibleForFreeTrial =
      plan.code === 'PRO' &&
      (await this.subscriptionsService.isEligibleForFreeTrial(email));
    console.log('Free trial eligibility check:', {
      planCode,
      email,
      isEligibleForFreeTrial,
      planCodeCheck: plan.code === 'PRO',
    });

    // We NO LONGER override the amount to ₹2 for free trials
    // Razorpay handles trial cycles internally
    // We just pass the isFreeTrial flag to the billing service
    if (isEligibleForFreeTrial === true) {
      console.log(
        'User is eligible for free trial. Will create subscription with 7-day trial period.',
      );
    } else {
      console.log('Regular pricing maintained:', { amount });
    }

    // For recurring payments, use the recurring payment processor
    if (isRecurring) {
      // Get user details for customer creation
      const user = await this.subscriptionsService.getUserById(userId);

      const recurringData = {
        amount, // Use the actual plan amount, not ₹2
        currency: plan.currency,
        billingCycle: normalizedBillingCycle,
        email,
        userId,
        fullName: user?.fullName || '',
        contact: data.contact || '',
        planCode,
        isFreeTrial: isEligibleForFreeTrial, // Pass the flag instead of overriding amount
      };

      console.log('Processing recurring payment with data:', recurringData);
      const recurringResult =
        await this.billingService.processRecurringPayment(recurringData);

      if (recurringResult.success) {
        return {
          success: true,
          subscriptionId: recurringResult.subscriptionId,
          planCode,
          email,
          userId,
          billingCycle: normalizedBillingCycle,
          isRecurring: true,
          amount: recurringResult.amount, // This will be the actual plan amount
          currency: recurringResult.currency,
          isFreeTrial: isEligibleForFreeTrial, // Include this in the response
        };
      } else {
        return {
          success: false,
          message: recurringResult.error,
        };
      }
    } else {
      // Create Razorpay order for one-time payment
      // Generate a receipt that's within Razorpay's 40-character limit
      const timestamp = Date.now().toString().substring(0, 10); // Use only first 10 digits
      let receipt = `receipt_${userId.substring(0, 8)}_${timestamp}`;
      if (receipt.length > 40) {
        receipt = receipt.substring(0, 40);
      }

      const orderData = {
        amount,
        currency: plan.currency,
        receipt: receipt,
        email,
        planCode,
        userId,
        billingCycle: normalizedBillingCycle,
        isFreeTrial: isEligibleForFreeTrial,
      };

      console.log('Processing payment with order data:', orderData);
      const orderResult = await this.billingService.processPayment(orderData);

      if (orderResult.success) {
        return {
          success: true,
          orderId: orderResult.orderId,
          amount: orderResult.amount,
          currency: orderResult.currency,
          planCode,
          email,
          userId,
          billingCycle: normalizedBillingCycle,
          isRecurring: false,
          isFreeTrial: isEligibleForFreeTrial, // Include this in the response
        };
      } else {
        return {
          success: false,
          message: orderResult.error,
        };
      }
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('check-eligibility')
  async checkEligibility(@Req() req: any, @Body() data: any) {
    console.log('Eligibility check request received:', {
      data,
      user: req.user,
    });
    const { email, planCode } = data;

    // Only PRO plan is eligible for free trial
    if (planCode !== 'PRO') {
      return {
        success: true,
        isEligibleForFreeTrial: false,
        reason: 'Only PRO plan is eligible for free trial',
      };
    }

    // Check if user is eligible for free trial
    const isEligibleForFreeTrial =
      await this.subscriptionsService.isEligibleForFreeTrial(email);

    return {
      success: true,
      isEligibleForFreeTrial,
      reason: isEligibleForFreeTrial
        ? 'User is eligible for free trial'
        : 'User has already used free trial',
    };
  }

  @Post('webhook')
  async handleWebhook(
    @Body() data: any,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    // Forward to billing service for signature verification
    const verificationResult = await this.billingService.handleWebhook(
      data,
      signature,
    );
    if (!verificationResult.success) {
      return verificationResult;
    }

    // If verification successful, process the webhook
    return this.subscriptionsService.handleWebhook(data);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('fallback-activate')
  async fallbackActivate(@Req() req: any, @Body() data: any) {
    const userId = req.user.id;
    return this.subscriptionsService.activateSubscriptionFallback({
      userId,
      planCode: data.planCode,
      billingCycle: data.billingCycle,
      isRecurring: data.isRecurring,
      providerSubscriptionId: data.providerSubscriptionId,
      providerPaymentId: data.providerPaymentId,
      email: data.email,
    });
  }

  // Temporary endpoint to mark email as used for free trial testing
  @UseGuards(AuthGuard('jwt'))
  @Post('mark-email-as-used')
  async markEmailAsUsed(@Req() req: any, @Body() data: any) {
    try {
      const { email } = data;

      // Mark email as used through subscriptions service
      await this.subscriptionsService.markEmailAsUsedForTesting(email);

      return {
        success: true,
        message: 'Email marked as used for free trial',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to mark email as used',
      };
    }
  }

  // Temporary endpoint to update account type for testing
  @UseGuards(AuthGuard('jwt'))
  @Post('update-account-type')
  async updateAccountType(@Req() req: any, @Body() data: any) {
    try {
      const { email, accountType } = data;

      // Find user by email using prisma directly since we need to get the user ID
      const user = await this.subscriptionsService.getPrisma().user.findUnique({
        where: { email: email },
      });

      if (!user) {
        return {
          success: false,
          message: 'User not found',
        };
      }

      // Update account type through subscriptions service
      await this.subscriptionsService.updateAccountTypeForTesting(
        user.id,
        accountType,
      );

      return {
        success: true,
        message: `Account type updated to ${accountType}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to update account type',
      };
    }
  }
}
