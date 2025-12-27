
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const count = await prisma.user.count();
    console.log(`Total Users: ${count}`);

    if (count === 0) {
        console.log('Seeding a test user...');
        await prisma.user.create({
            data: {
                email: 'testItems@example.com',
                fullName: 'Test User',
                passwordHash: 'placeholder',
                provider: 'EMAIL',
                status: 'VERIFIED',
                accountType: 'CUSTOMER',
            },
        });
        console.log('Test user created.');
    } else {
        const users = await prisma.user.findMany({ take: 5 });
        console.log('Existing users:', users);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
