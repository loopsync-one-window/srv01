import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testWebhook() {
  try {
    // Get a user and plan to use in our test
    const user = await prisma.user.findFirst({
      where: { email: 'john@example.com' }
    });
    
    const plan = await prisma.plan.findFirst({
      where: { code: 'PRO' }
    });
    
    if (!user || !plan) {
      console.log('User or plan not found');
      return;
    }
    
    console.log('Testing webhook with user:', user.email);
    console.log('Testing webhook with plan:', plan.name);
    
    // Simulate a subscription.activated webhook event
    const webhookData = {
      event: 'subscription.activated',
      payload: {
        subscription: {
          entity: {
            id: 'test_sub_' + Date.now(),
            customer_id: 'cust_' + Date.now(),
            plan_id: plan.id,
            email: user.email,
            start_at: Math.floor(Date.now() / 1000),
            notes: {
              planCode: plan.code,
              userId: user.id
            },
            quantity: 1,
            item: {
              amount: plan.price
            },
            trial_end: null
          }
        }
      }
    };
    
    console.log('Webhook data to send:', JSON.stringify(webhookData, null, 2));
    
    // Make a request to our webhook endpoint
    const response = await fetch('https://srv01.loopsync.cloud/subscriptions/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookData),
    });
    
    const result = await response.json();
    console.log('Webhook response:', result);
    
  } catch (error) {
    console.error('Error testing webhook:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testWebhook();