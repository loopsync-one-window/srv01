// Simple test script to verify payment methods API
// This script assumes you have a valid JWT token

const API_BASE = 'http://localhost:8000';

// Replace with a valid JWT token from a logged in user
const JWT_TOKEN = 'YOUR_JWT_TOKEN_HERE';

async function testPaymentMethodsAPI() {
  console.log('Testing Payment Methods API...\n');
  
  try {
    // Test creating a billing address
    console.log('1. Creating billing address...');
    const billingAddress = {
      addressLine1: '123 Main St',
      addressLine2: 'Apt 4B',
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'India',
      pinCode: '400001',
      phoneNumber: '9876543210'
    };
    
    const billingResponse = await fetch(`${API_BASE}/payment-methods/billing-address`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`
      },
      body: JSON.stringify(billingAddress)
    });
    
    const billingResult = await billingResponse.json();
    console.log('Billing address created:', billingResult);
    
    // Test creating a payment method
    console.log('\n2. Creating payment method...');
    const paymentMethod = {
      type: 'razorpay',
      providerDetails: {
        email: 'user@example.com',
        contact: '9876543210'
      }
    };
    
    const paymentResponse = await fetch(`${API_BASE}/payment-methods/payment-method`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${JWT_TOKEN}`
      },
      body: JSON.stringify(paymentMethod)
    });
    
    const paymentResult = await paymentResponse.json();
    console.log('Payment method created:', paymentResult);
    
    // Test searching for payment methods and billing addresses
    console.log('\n3. Searching payment methods and billing addresses...');
    const searchResponse = await fetch(`${API_BASE}/payment-methods/search?email=user@example.com`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`
      }
    });
    
    const searchResult = await searchResponse.json();
    console.log('Search results:', searchResult);
    
    console.log('\nAPI tests completed successfully!');
  } catch (error) {
    console.error('Error testing API:', error);
  }
}

// Run the test
testPaymentMethodsAPI();