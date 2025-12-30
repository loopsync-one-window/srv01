import { IsString, IsNotEmpty } from 'class-validator';

export class CreateOrderDto {
    @IsString()
    @IsNotEmpty()
    appId: string;
}

export class VerifyPaymentDto {
    @IsString()
    @IsNotEmpty()
    razorpayOrderId: string;

    @IsString()
    @IsNotEmpty()
    razorpayPaymentId: string;

    @IsString()
    @IsNotEmpty()
    razorpaySignature: string;

    @IsString()
    @IsNotEmpty()
    appId: string;
}

export class CreateContributionDto {
    @IsString()
    @IsNotEmpty()
    appId: string;

    @IsNotEmpty()
    amount: number;
}

export class VerifyContributionDto {
    @IsString()
    @IsNotEmpty()
    razorpayOrderId: string;

    @IsString()
    @IsNotEmpty()
    razorpayPaymentId: string;

    @IsString()
    @IsNotEmpty()
    razorpaySignature: string;

    @IsString()
    @IsNotEmpty()
    appId: string;
}
