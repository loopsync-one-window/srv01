import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPlans() {
  try {
    // Check if there are any plans in the database
    const plans = await prisma.plan.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`Found ${plans.length} plans in the database:`);
    
    if (plans.length > 0) {
      plans.forEach((plan, index) => {
        console.log(`\n--- Plan ${index + 1} ---`);
        console.log(`ID: ${plan.id}`);
        console.log(`Code: ${plan.code}`);
        console.log(`Name: ${plan.name}`);
        console.log(`Description: ${plan.description}`);
        console.log(`Price: ${plan.price}`);
        console.log(`Currency: ${plan.currency}`);
        console.log(`Billing Cycle: ${plan.billingCycle}`);
        console.log(`Is Active: ${plan.isActive}`);
        console.log(`Created At: ${plan.createdAt}`);
      });
    } else {
      console.log("No plans found in the database.");
    }
  } catch (error) {
    console.error('Error checking plans:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPlans();