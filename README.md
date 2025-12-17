# SaaS Platform Backend

A production-ready backend server for a SaaS product built with NestJS, TypeScript, Prisma ORM, and PostgreSQL.

## Features

- ✅ NestJS modular architecture
- ✅ TypeScript (strict mode)
- ✅ Prisma ORM with PostgreSQL
- ✅ JWT Auth (Access + Refresh tokens)
- ✅ Google OAuth Sign-in
- ✅ Email OTP Verification using Zoho Mail SMTP
- ✅ Subscription Plans + Billing Status
- ✅ Visitor vs Customer Accounts (access levels)
- ✅ Feature Flags API (Plan-based + User overrides)
- ✅ Swagger docs
- ✅ Clean and scalable architecture

## Prerequisites

- Node.js >= 18
- PostgreSQL >= 15
- Docker (optional, for containerization)

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Copy `.env.example` to `.env` and update the values:
   ```bash
   cp .env.example .env
   ```

3. **Run database migrations:**
   ```bash
   npx prisma migrate dev
   ```

4. **Generate Prisma client:**
   ```bash
   npx prisma generate
   ```

5. **Start the development server:**
   ```bash
   npm run start:dev
   ```

## Project Structure

```
src/
  ├── main.ts              # Application entry point
  ├── app.module.ts        # Root module
  ├── common/              # Shared utilities, guards, interceptors
  ├── config/              # Configuration files
  ├── prisma/              # Prisma service
  ├── modules/
  │   ├── auth/            # Authentication module
  │   ├── users/           # Users module
  │   ├── otp/             # OTP module
  │   ├── plans/           # Subscription plans module
  │   ├── features/        # Feature flags module
  │   ├── subscriptions/   # Subscriptions module
  │   ├── billing/         # Billing module
  │   ├── health/          # Health check module
  │   └── admin/           # Admin module
```

## API Documentation

Once the server is running, you can access the Swagger API documentation at:
```
https://srv01.loopsync.cloud/api

### Atlas Models API

Manage per-user enablement of Atlas models. Requires JWT authentication.

- Base path: `profile`

- Models:
  - `Compute-Max`
  - `R3 Advanced`
  - `Vision Pro`

#### Get Models Status

- Method: `GET`
- Path: `/profile/models/status`
- Auth: `Authorization: Bearer <accessToken>`
- Response:

```json
{
  "computeMax": "active",
  "r3Advanced": "disabled",
  "visionPro": "active"
}
```

Values are `active` or `disabled` reflecting the user’s current settings.

#### Update Models

- Method: `POST`
- Path: `/profile/models`
- Auth: `Authorization: Bearer <accessToken>`
- Body:

```json
{
  "computeMax": true,
  "r3Advanced": false,
  "visionPro": true
}
```

- Response:

```json
{
  "success": true,
  "computeMax": "active",
  "r3Advanced": "disabled",
  "visionPro": "active"
}
```

- Notes:
  - Any field may be omitted; only provided flags are updated.
  - Values map internally to feature keys:
    - `MODEL_COMPUTE_MAX`
    - `MODEL_R3_ADVANCED`
    - `MODEL_VISION_PRO`
  - Storage uses `UserFeatureOverride.enabled` with `Feature.dataType = BOOLEAN`.

#### UI Integration

Use these APIs to back the toggles in `console/components/home/contents/atlas-manager.tsx` under “Atlas Models”.

Example request from the console app:

```http
POST /profile/models
Authorization: Bearer <accessToken>
Content-Type: application/json

{"computeMax":true,"r3Advanced":false,"visionPro":true}
```
```

## Docker

To run the application with Docker:

1. **Build and start services:**
   ```bash
   docker-compose up --build
   ```

2. **Run migrations (first time only):**
   ```bash
   docker-compose exec app npx prisma migrate dev
   ```

## Environment Variables

Create a `.env` file with the following variables:

```env
# Server
PORT=8000

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/saas_db

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=900s
JWT_REFRESH_SECRET=your-super-secret-refresh-key
JWT_REFRESH_EXPIRES_IN=7d

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# SMTP (Zoho)
SMTP_HOST=smtp.zoho.in
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=no-reply@domain.com
SMTP_PASSWORD=APP_PASSWORD
SMTP_FROM="App Name <no-reply@domain.com>"
```

## Testing

Run unit tests:
```bash
npm run test
```

Run end-to-end tests:
```bash
npm run test:e2e
```

## License

This project is licensed under the MIT License.
