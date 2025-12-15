import { PrismaClient } from '@prisma/client';

// Try to access the types
const prisma = new PrismaClient();

// This should work if the types are properly generated
console.log('Prisma client initialized successfully');