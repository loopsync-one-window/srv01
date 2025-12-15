import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create sample plans
  const proPlan = await prisma.plan.upsert({
    where: { code: 'PRO' },
    update: {},
    create: {
      code: 'PRO',
      name: 'PRO Plan',
      description: 'Ideal for individuals and small teams evaluating PRO features.',
      price: 75900, // ₹759 in paise
      currency: 'INR',
      billingCycle: 'MONTHLY',
      isActive: true,
    },
  });

  const proPrimeXPlan = await prisma.plan.upsert({
    where: { code: 'PRO_PRIME-X' },
    update: {},
    create: {
      code: 'PRO_PRIME-X',
      name: 'PRO PRIME-X Plan',
      description: 'Built for scaling businesses and teams that need more power.',
      price: 129900, // ₹1,299 in paise
      currency: 'INR',
      billingCycle: 'MONTHLY',
      isActive: true,
    },
  });

  console.log('Plans created/updated:', { proPlan, proPrimeXPlan });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });