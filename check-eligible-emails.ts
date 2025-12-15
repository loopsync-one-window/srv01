import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkEligibleEmails() {
  try {
    // Check if there are any eligible emails in the database
    const eligibleEmails = await (prisma as any).eligibleEmail.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`Found ${eligibleEmails.length} eligible emails in the database:`);
    
    if (eligibleEmails.length > 0) {
      eligibleEmails.forEach((eligibleEmail: any, index: number) => {
        console.log(`\n--- Eligible Email ${index + 1} ---`);
        console.log(`ID: ${eligibleEmail.id}`);
        console.log(`Email: ${eligibleEmail.email}`);
        console.log(`Is Used: ${eligibleEmail.isUsed}`);
        console.log(`Created At: ${eligibleEmail.createdAt}`);
      });
    } else {
      console.log("No eligible emails found in the database.");
    }
  } catch (error) {
    console.error('Error checking eligible emails:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkEligibleEmails();