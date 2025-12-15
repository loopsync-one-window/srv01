import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface CreatePaymentMethodDto {
  userId: string;
  type: string;
  providerDetails: Prisma.JsonObject;
  isDefault?: boolean;
}

export interface CreateBillingAddressDto {
  userId: string;
  addressLine1: string;
  addressLine2?: string;
  city?: string;
  state: string;
  country: string;
  pinCode: string;
  phoneNumber: string;
  isDefault?: boolean;
}

export interface SearchPaymentMethodsDto {
  userId?: string;
  email?: string;
  phoneNumber?: string;
}

@Injectable()
export class PaymentMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new payment method for a user
   */
  async createPaymentMethod(createPaymentMethodDto: CreatePaymentMethodDto) {
    const {
      userId,
      type,
      providerDetails,
      isDefault = false,
    } = createPaymentMethodDto;

    // Ensure at least one default exists: if none, set the new one as default
    const existingDefault = await (this.prisma as any).paymentMethod.findFirst({
      where: { userId, isDefault: true },
    });
    const finalIsDefault = isDefault || !existingDefault;

    // If this is marked as default, unset other default payment methods for this user
    if (finalIsDefault) {
      await this.prisma.$transaction([
        (this.prisma as any).paymentMethod.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        }),
      ]);
    }

    return (this.prisma as any).paymentMethod.create({
      data: {
        userId,
        type,
        providerDetails,
        isDefault: finalIsDefault,
      },
    });
  }

  /**
   * Create a new billing address for a user
   */
  async createBillingAddress(createBillingAddressDto: CreateBillingAddressDto) {
    const {
      userId,
      isDefault = false,
      ...addressData
    } = createBillingAddressDto;

    // Ensure at least one default exists: if none, set the new one as default
    const existingDefault = await (this.prisma as any).billingAddress.findFirst(
      {
        where: { userId, isDefault: true },
      },
    );
    const finalIsDefault = isDefault || !existingDefault;

    // If this is marked as default, unset other default addresses for this user
    if (finalIsDefault) {
      await this.prisma.$transaction([
        (this.prisma as any).billingAddress.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        }),
      ]);
    }

    return (this.prisma as any).billingAddress.create({
      data: {
        userId,
        ...addressData,
        isDefault: finalIsDefault,
      },
    });
  }

  /**
   * Get all payment methods for a user
   */
  async getPaymentMethodsByUserId(userId: string) {
    return (this.prisma as any).paymentMethod.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get all billing addresses for a user
   */
  async getBillingAddressesByUserId(userId: string) {
    return (this.prisma as any).billingAddress.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Search for payment methods and billing addresses by user ID, email, or phone number
   */
  async searchPaymentMethodsAndAddresses(searchDto: SearchPaymentMethodsDto) {
    const { userId, email, phoneNumber } = searchDto;

    // Build the where clause dynamically
    const whereConditions: any = {};

    if (userId) {
      whereConditions.userId = userId;
    }

    if (email) {
      whereConditions.user = { email };
    }

    if (phoneNumber) {
      whereConditions.phoneNumber = phoneNumber;
    }

    // If no search criteria provided, return empty arrays
    if (Object.keys(whereConditions).length === 0) {
      return {
        paymentMethods: [],
        billingAddresses: [],
      };
    }

    // Get payment methods
    const paymentMethods = await (this.prisma as any).paymentMethod.findMany({
      where: whereConditions,
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });

    // Get billing addresses
    const billingAddresses = await (this.prisma as any).billingAddress.findMany(
      {
        where: whereConditions,
        include: { user: true },
        orderBy: { createdAt: 'desc' },
      },
    );

    return {
      paymentMethods,
      billingAddresses,
    };
  }

  /**
   * Get default payment method for a user
   */
  async getDefaultPaymentMethod(userId: string) {
    return (this.prisma as any).paymentMethod.findFirst({
      where: { userId, isDefault: true },
    });
  }

  /**
   * Get default billing address for a user
   */
  async getDefaultBillingAddress(userId: string) {
    return (this.prisma as any).billingAddress.findFirst({
      where: { userId, isDefault: true },
    });
  }

  /**
   * Delete a payment method
   */
  async deletePaymentMethod(id: string) {
    return (this.prisma as any).paymentMethod.delete({
      where: { id },
    });
  }

  /**
   * Delete a billing address
   */
  async deleteBillingAddress(id: string) {
    return (this.prisma as any).billingAddress.delete({
      where: { id },
    });
  }

  /**
   * Update a payment method
   */
  async updatePaymentMethod(id: string, data: Partial<CreatePaymentMethodDto>) {
    // If setting as default, unset other defaults for this user
    if (data.isDefault) {
      const paymentMethod = await (this.prisma as any).paymentMethod.findUnique(
        { where: { id } },
      );
      if (paymentMethod) {
        await this.prisma.$transaction([
          (this.prisma as any).paymentMethod.updateMany({
            where: { userId: paymentMethod.userId, isDefault: true },
            data: { isDefault: false },
          }),
        ]);
      }
    }

    return (this.prisma as any).paymentMethod.update({
      where: { id },
      data,
    });
  }

  /**
   * Update a billing address
   */
  async updateBillingAddress(
    id: string,
    data: Partial<CreateBillingAddressDto>,
  ) {
    // If setting as default, unset other defaults for this user
    if (data.isDefault) {
      const address = await (this.prisma as any).billingAddress.findUnique({
        where: { id },
      });
      if (address) {
        await this.prisma.$transaction([
          (this.prisma as any).billingAddress.updateMany({
            where: { userId: address.userId, isDefault: true },
            data: { isDefault: false },
          }),
        ]);
      }
    }

    return (this.prisma as any).billingAddress.update({
      where: { id },
      data,
    });
  }
}
