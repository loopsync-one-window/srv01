import { Controller, Get, Post, Delete, Param, Query, Body, UseGuards, Req } from '@nestjs/common';
import { AppsService } from './app.service';
import { GetAppsQuery, DownloadAppDto } from './app.types';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { OptionalAuthGuard } from 'src/common/guards/optional-auth.guard';
import { AccessTokenGuard } from 'src/common/guards/access-token.guard';

// If no global auth guard, we might need one for download but keeping it open or looking for user if present is tricky without guard.
// I'll assume standard AuthGuard if I need user.

@ApiTags('store')
@Controller('store/apps')
export class AppsController {
    constructor(private readonly appsService: AppsService) { }

    @Get()
    @ApiOperation({ summary: 'Get all published apps' })
    async getApps(@Query() query: GetAppsQuery) {
        return this.appsService.findAll(query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get app details' })
    async getApp(@Param('id') id: string) {
        // We pass user as undefined for now, checking logic handled in service
        return this.appsService.findOne(id);
    }

    @Post(':id/download')
    @ApiOperation({ summary: 'Get signed download URL' })
    @UseGuards(OptionalAuthGuard)
    async downloadApp(@Param('id') id: string, @Body() dto: DownloadAppDto, @Req() req: any) {
        const userId = req.user?.id || req.user?.sub || 'guest'; // User ID from auth token
        return this.appsService.getDownloadUrl(id, dto, userId);
    }

    @Post(':id/report')
    @ApiOperation({ summary: 'Report an app' })
    async reportApp(@Param('id') id: string, @Body() body: { reason: string; description: string; reporterName: string; reporterEmail: string }) {
        return this.appsService.reportApp(id, body);
    }

    @Get(':id/reviews')
    @ApiOperation({ summary: 'Get app reviews' })
    async getReviews(@Param('id') id: string) {
        return this.appsService.getReviews(id);
    }

    @Post(':id/reviews')
    @UseGuards(OptionalAuthGuard)
    @ApiOperation({ summary: 'Submit a review' })
    async submitReview(@Param('id') id: string, @Body() body: { rating: number; title: string; content: string }, @Req() req: any) {
        const userId = req.user?.sub || req.user?.id || 'guest';
        return this.appsService.createReview(id, userId, body);
    }

    @Delete(':id/reviews/:reviewId')
    @UseGuards(OptionalAuthGuard)
    @ApiOperation({ summary: 'Delete a review' })
    async deleteReview(@Param('id') appId: string, @Param('reviewId') reviewId: string, @Req() req: any) {
        const userId = req.user?.sub || req.user?.id || 'guest';
        return this.appsService.deleteReview(appId, reviewId, userId);
    }
}
