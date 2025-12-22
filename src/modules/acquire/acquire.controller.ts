import { Body, Controller, Post } from '@nestjs/common';
import { AcquireService, AcquisitionInquiryDto } from './acquire.service';

@Controller('acquire')
export class AcquireController {
    constructor(private readonly acquireService: AcquireService) { }

    @Post('inquiry')
    async submitInquiry(@Body() data: AcquisitionInquiryDto) {
        await this.acquireService.handleInquiry(data);
        return { success: true, message: 'Inquiry received' };
    }
}
