
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DevelopersService } from './developers.service';

@Controller('api/v1/overview')
@UseGuards(AuthGuard('jwt'))
export class OverviewController {
    constructor(private readonly developersService: DevelopersService) { }

    @Get()
    async getOverviewSnapshot(@Req() req: any, @Query('search') search: string) {
        return this.developersService.getOverviewSnapshot(req.user.id, search);
    }
}
