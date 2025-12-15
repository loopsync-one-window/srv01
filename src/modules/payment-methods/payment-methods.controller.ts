import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Query,
  Delete,
  Put,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PaymentMethodsService } from './payment-methods.service';
import {
  CreatePaymentMethodDto,
  CreateBillingAddressDto,
  SearchPaymentMethodsDto,
} from './payment-methods.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('payment-methods')
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @UseGuards(AuthGuard('jwt'))
  @Post('payment-method')
  @ApiOperation({ summary: 'Create a new payment method for a user' })
  @ApiResponse({
    status: 201,
    description: 'Payment method created successfully.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  @ApiBearerAuth()
  async createPaymentMethod(
    @Req() req: any,
    @Body() createPaymentMethodDto: CreatePaymentMethodDto,
  ) {
    // Extract userId from JWT token
    const userId = req.user.id;

    // Override userId in DTO with authenticated user's ID
    const paymentMethodData = {
      ...createPaymentMethodDto,
      userId,
    };

    return this.paymentMethodsService.createPaymentMethod(paymentMethodData);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('billing-address')
  @ApiOperation({ summary: 'Create a new billing address for a user' })
  @ApiResponse({
    status: 201,
    description: 'Billing address created successfully.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  @ApiBearerAuth()
  async createBillingAddress(
    @Req() req: any,
    @Body() createBillingAddressDto: CreateBillingAddressDto,
  ) {
    // Extract userId from JWT token
    const userId = req.user.id;

    // Override userId in DTO with authenticated user's ID
    const billingAddressData = {
      ...createBillingAddressDto,
      userId,
    };

    return this.paymentMethodsService.createBillingAddress(billingAddressData);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('user/:userId/payment-methods')
  @ApiOperation({ summary: 'Get all payment methods for a user' })
  @ApiResponse({
    status: 200,
    description: 'Payment methods retrieved successfully.',
  })
  @ApiBearerAuth()
  async getPaymentMethodsByUserId(@Param('userId') userId: string) {
    return this.paymentMethodsService.getPaymentMethodsByUserId(userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('user/:userId/billing-addresses')
  @ApiOperation({ summary: 'Get all billing addresses for a user' })
  @ApiResponse({
    status: 200,
    description: 'Billing addresses retrieved successfully.',
  })
  @ApiBearerAuth()
  async getBillingAddressesByUserId(@Param('userId') userId: string) {
    return this.paymentMethodsService.getBillingAddressesByUserId(userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('search')
  @ApiOperation({
    summary:
      'Search payment methods and billing addresses by user ID, email, or phone number',
  })
  @ApiResponse({
    status: 200,
    description: 'Search results retrieved successfully.',
  })
  @ApiBearerAuth()
  async searchPaymentMethodsAndAddresses(
    @Query() searchDto: SearchPaymentMethodsDto,
  ) {
    return this.paymentMethodsService.searchPaymentMethodsAndAddresses(
      searchDto,
    );
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('user/:userId/default-payment-method')
  @ApiOperation({ summary: 'Get default payment method for a user' })
  @ApiResponse({
    status: 200,
    description: 'Default payment method retrieved successfully.',
  })
  @ApiBearerAuth()
  async getDefaultPaymentMethod(@Param('userId') userId: string) {
    return this.paymentMethodsService.getDefaultPaymentMethod(userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('user/:userId/default-billing-address')
  @ApiOperation({ summary: 'Get default billing address for a user' })
  @ApiResponse({
    status: 200,
    description: 'Default billing address retrieved successfully.',
  })
  @ApiBearerAuth()
  async getDefaultBillingAddress(@Param('userId') userId: string) {
    return this.paymentMethodsService.getDefaultBillingAddress(userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('payment-method/:id')
  @ApiOperation({ summary: 'Delete a payment method' })
  @ApiResponse({
    status: 200,
    description: 'Payment method deleted successfully.',
  })
  @ApiBearerAuth()
  async deletePaymentMethod(@Param('id') id: string) {
    return this.paymentMethodsService.deletePaymentMethod(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('billing-address/:id')
  @ApiOperation({ summary: 'Delete a billing address' })
  @ApiResponse({
    status: 200,
    description: 'Billing address deleted successfully.',
  })
  @ApiBearerAuth()
  async deleteBillingAddress(@Param('id') id: string) {
    return this.paymentMethodsService.deleteBillingAddress(id);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('payment-method/:id')
  @ApiOperation({ summary: 'Update a payment method' })
  @ApiResponse({
    status: 200,
    description: 'Payment method updated successfully.',
  })
  @ApiBearerAuth()
  async updatePaymentMethod(
    @Param('id') id: string,
    @Body() updateData: Partial<CreatePaymentMethodDto>,
  ) {
    return this.paymentMethodsService.updatePaymentMethod(id, updateData);
  }

  @UseGuards(AuthGuard('jwt'))
  @Put('billing-address/:id')
  @ApiOperation({ summary: 'Update a billing address' })
  @ApiResponse({
    status: 200,
    description: 'Billing address updated successfully.',
  })
  @ApiBearerAuth()
  async updateBillingAddress(
    @Param('id') id: string,
    @Body() updateData: Partial<CreateBillingAddressDto>,
  ) {
    return this.paymentMethodsService.updateBillingAddress(id, updateData);
  }
}
