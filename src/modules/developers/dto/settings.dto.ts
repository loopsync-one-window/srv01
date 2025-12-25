import { IsString, IsOptional, IsBoolean, IsUrl } from 'class-validator';

export class UpdateProfileDto {
    @IsString()
    @IsOptional()
    displayName?: string;

    @IsString()
    @IsOptional()
    bio?: string;

    // email updates might need separate validation/flow, keeping optional/omitted for now as per req
}

export class UpdateNotificationsDto {
    @IsBoolean()
    @IsOptional()
    deploymentStatus?: boolean;

    @IsBoolean()
    @IsOptional()
    payoutUpdates?: boolean;

    @IsBoolean()
    @IsOptional()
    marketingEmails?: boolean;
}

export class DeleteAccountDto {
    @IsBoolean()
    confirm: boolean;
}
