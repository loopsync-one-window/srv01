
import { IsBoolean, IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreatePaymentOrderDto {
    @IsNotEmpty()
    @IsString()
    registrationId!: string;

    @IsOptional()
    @IsBoolean()
    verifiedBadge?: boolean;
}
