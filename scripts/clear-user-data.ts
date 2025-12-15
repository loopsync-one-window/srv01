import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearUserData() {
  try {
    console.log('🚨 Starting full database cleanup...');

    // ---------- USER-RELATED DEPENDENCIES ----------
    console.log('Deleting EmailOtps...');
    await (prisma as any).emailOtp.deleteMany();

    console.log('Deleting Subscriptions...');
    await (prisma as any).subscription.deleteMany();

    console.log('Deleting PaymentMethods...');
    await (prisma as any).paymentMethod.deleteMany();

    console.log('Deleting BillingAddresses...');
    await (prisma as any).billingAddress.deleteMany();

    console.log('Deleting UserFeatureOverrides...');
    await (prisma as any).userFeatureOverride.deleteMany();

    console.log('Deleting Invoices...');
    await (prisma as any).invoice.deleteMany();

    console.log('Deleting Users...');
    const users = await (prisma as any).user.deleteMany();
    console.log(`✅ Deleted ${users.count} users`);

    console.log('Deleting EligibleEmails...');
    const emails = await (prisma as any).eligibleEmail.deleteMany();
    console.log(`✅ Deleted ${emails.count} eligible emails`);

    // ---------- PLAN-RELATED DEPENDENCIES ----------
    console.log('Deleting PlanFeatures...');
    await (prisma as any).planFeature.deleteMany();

    console.log('Deleting Plans...');
    const plans = await (prisma as any).plan.deleteMany();
    console.log(`✅ Deleted ${plans.count} plans`);

    console.log('🎉 Cleanup completed successfully!');
  } catch (error) {
    console.error('❌ Error while clearing data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearUserData();
