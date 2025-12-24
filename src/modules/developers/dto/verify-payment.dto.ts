
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyPaymentDto {
    @IsNotEmpty()
    @IsString()
    orderId!: string;

    @IsNotEmpty()
    @IsString()
    paymentId!: string;

    @IsNotEmpty()
    @IsString()
    signature!: string;
}
