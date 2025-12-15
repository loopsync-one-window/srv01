import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUsers() {
  try {
    // Check if there are any users in the database
    const users = await prisma.user.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    console.log(`Found ${users.length} users in the database:`);
    
    if (users.length > 0) {
      users.forEach((user, index) => {
        console.log(`\n--- User ${index + 1} ---`);
        console.log(`ID: ${user.id}`);
        console.log(`Email: ${user.email}`);
        console.log(`Full Name: ${user.fullName}`);
        console.log(`Account Type: ${user.accountType}`);
        console.log(`Status: ${user.status}`);
        console.log(`Created At: ${user.createdAt}`);
      });
    } else {
      console.log("No users found in the database.");
    }
  } catch (error) {
    console.error('Error checking users:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();