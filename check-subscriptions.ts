import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSubscriptions() {
  try {
    // Check if there are any subscriptions in the database
    const subscriptions = await prisma.subscription.findMany({
      include: {
        user: true,
        plan: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`Found ${subscriptions.length} subscriptions in the database:`);
    
    if (subscriptions.length > 0) {
      subscriptions.forEach((subscription, index) => {
        console.log(`\n--- Subscription ${index + 1} ---`);
        console.log(`ID: ${subscription.id}`);
        console.log(`Status: ${subscription.status}`);
        console.log(`User: ${subscription.user.email} (${subscription.user.fullName})`);
        console.log(`Plan: ${subscription.plan.name} (${subscription.plan.code})`);
        console.log(`Created At: ${subscription.createdAt}`);
        console.log(`Started At: ${subscription.startedAt}`);
        console.log(`Expires At: ${subscription.expiresAt}`);
        console.log(`Provider Subscription ID: ${subscription.providerSubscriptionId}`);
      });
    } else {
      console.log("No subscriptions found in the database.");
    }
  } catch (error) {
    console.error('Error checking subscriptions:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSubscriptions();