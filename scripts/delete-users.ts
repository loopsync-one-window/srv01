import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteAllUsers() {
  try {
    await prisma.userFeatureOverride.deleteMany();
    await prisma.subscription.deleteMany();
    await prisma.emailOtp.deleteMany();
    await (prisma as any).invoice.deleteMany();
    
    const deletedUsers = await prisma.user.deleteMany();
    
    console.log(`Successfully deleted ${deletedUsers.count} users and all related records.`);
  } catch (error) {
    console.error('Error deleting users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

deleteAllUsers();
