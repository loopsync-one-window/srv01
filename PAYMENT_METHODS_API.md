# Payment Methods and Billing Addresses API

This document describes the API endpoints for managing user payment methods and billing addresses.

## Base URL

```
https://srv01.loopsync.cloud/payment-methods
```

## Authentication

All endpoints require a valid JWT token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

## Endpoints

### Create Payment Method

**POST** `/payment-methods/payment-method`

Create a new payment method for the authenticated user.

#### Request Body

```json
{
  "type": "string",           // Payment method type (e.g., 'razorpay', 'upi', 'netbanking')
  "providerDetails": {},      // Provider-specific details (JSON object)
  "isDefault": boolean        // Optional, whether this is the default payment method
}
```

#### Response

```json
{
  "id": "string",
  "userId": "string",
  "type": "string",
  "providerDetails": {},
  "isDefault": boolean,
  "createdAt": "datetime",
  "updatedAt": "datetime"
}
```

### Create Billing Address

**POST** `/payment-methods/billing-address`

Create a new billing address for the authenticated user.

#### Request Body

```json
{
  "addressLine1": "string",   // Required
  "addressLine2": "string",   // Optional
  "city": "string",           // Optional
  "state": "string",          // Required
  "country": "string",        // Required
  "pinCode": "string",        // Required
  "phoneNumber": "string",    // Required
  "isDefault": boolean        // Optional, whether this is the default address
}
```

#### Response

```json
{
  "id": "string",
  "userId": "string",
  "addressLine1": "string",
  "addressLine2": "string",
  "city": "string",
  "state": "string",
  "country": "string",
  "pinCode": "string",
  "phoneNumber": "string",
  "isDefault": boolean,
  "createdAt": "datetime",
  "updatedAt": "datetime"
}
```

### Get User's Payment Methods

**GET** `/payment-methods/user/:userId/payment-methods`

Get all payment methods for a specific user.

#### Response

Array of payment method objects.

### Get User's Billing Addresses

**GET** `/payment-methods/user/:userId/billing-addresses`

Get all billing addresses for a specific user.

#### Response

Array of billing address objects.

### Search Payment Methods and Billing Addresses

**GET** `/payment-methods/search?userId=:userId&email=:email&phoneNumber=:phoneNumber`

Search for payment methods and billing addresses by user ID, email, or phone number.

#### Query Parameters

- `userId`: User ID
- `email`: User email
- `phoneNumber`: Phone number

#### Response

```json
{
  "paymentMethods": [],
  "billingAddresses": []
}
```

### Get Default Payment Method

**GET** `/payment-methods/user/:userId/default-payment-method`

Get the default payment method for a user.

### Get Default Billing Address

**GET** `/payment-methods/user/:userId/default-billing-address`

Get the default billing address for a user.

### Update Payment Method

**PUT** `/payment-methods/payment-method/:id`

Update a payment method.

### Update Billing Address

**PUT** `/payment-methods/billing-address/:id`

Update a billing address.

### Delete Payment Method

**DELETE** `/payment-methods/payment-method/:id`

Delete a payment method.

### Delete Billing Address

**DELETE** `/payment-methods/billing-address/:id`

Delete a billing address.

## Example Usage

### Save a Razorpay payment method

```bash
curl -X POST https://srv01.loopsync.cloud/payment-methods/payment-method \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt_token>" \
  -d '{
    "type": "razorpay",
    "providerDetails": {
      "email": "user@example.com",
      "contact": "9876543210"
    },
    "isDefault": true
  }'
```

### Save a billing address

```bash
curl -X POST https://srv01.loopsync.cloud/payment-methods/billing-address \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt_token>" \
  -d '{
    "addressLine1": "123 Main Street",
    "addressLine2": "Apartment 4B",
    "city": "Mumbai",
    "state": "Maharashtra",
    "country": "India",
    "pinCode": "400001",
    "phoneNumber": "9876543210",
    "isDefault": true
  }'
```

### Search for user's payment methods and billing addresses

```bash
curl -X GET "https://srv01.loopsync.cloud/payment-methods/search?email=user@example.com" \
  -H "Authorization: Bearer <jwt_token>"
```