import { Controller, Get, Patch, Body, UseGuards, Req, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { DevelopersService } from './developers.service';

@Controller('api/v1/banking')
@UseGuards(AuthGuard('jwt'))
export class BankingController {
    constructor(private readonly developersService: DevelopersService) { }

    @Get('payout-account')
    async getPayoutAccount(@Req() req: any) {
        return this.developersService.getPayoutAccount(req.user.id);
    }

    @Patch('payout-account')
    async updatePayoutAccount(@Req() req: any, @Body() body: any) {
        return this.developersService.updatePayoutAccount(req.user.id, body);
    }

    @Get('tax')
    async getTaxInfo(@Req() req: any) {
        return this.developersService.getTaxInfo(req.user.id);
    }

    @Patch('tax')
    async updateTaxInfo(@Req() req: any, @Body() body: any) {
        return this.developersService.updateTaxInfo(req.user.id, body);
    }

    @Get('payout-schedule')
    async getPayoutSchedule(@Req() req: any) {
        return this.developersService.getPayoutSchedule(req.user.id);
    }

    @Patch('payout-schedule')
    async updatePayoutSchedule(@Req() req: any, @Body() body: any) {
        return this.developersService.updatePayoutSchedule(req.user.id, body);
    }

    @Get('transactions')
    async getTransactions(@Req() req: any) {
        return this.developersService.getTransactions(req.user.id);
    }

    @Patch('tax/pan-card')
    @UseInterceptors(FileInterceptor('file'))
    async uploadPanCard(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
        if (!file) throw new BadRequestException('File is required');
        return this.developersService.uploadPanCard(req.user.id, file);
    }
}
