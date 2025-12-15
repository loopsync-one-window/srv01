import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';

const prisma = new PrismaClient();

async function generateTestToken() {
  try {
    // Get a user to generate token for
    const user = await prisma.user.findFirst({
      where: { email: 'john@example.com' }
    });
    
    if (!user) {
      console.log('User not found');
      return;
    }
    
    console.log('Generating token for user:', user.email);
    
    // Create JWT service
    const jwtService = new JwtService();
    
    // Generate token
    const payload = { email: user.email, sub: user.id };
    const accessToken = jwtService.sign(payload, {
      secret: 'super-secret-jwt-key-change-in-production',
      expiresIn: '1h',
    });
    
    console.log('Generated access token:');
    console.log(accessToken);
    
    // Test the admin endpoint with this token
    const response = await fetch('http://localhost:8000/admin/subscribed-users', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    const result = await response.json();
    console.log('Admin endpoint response:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('Error generating test token:', error);
  } finally {
    await prisma.$disconnect();
  }
}

generateTestToken();