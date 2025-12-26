import { Controller, Post, Get, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DevelopersService } from './developers.service';

@Controller('api/v1/apps')
@UseGuards(AuthGuard('jwt'))
export class AppsController {
    constructor(private readonly developersService: DevelopersService) { }

    @Post()
    async createApp(@Req() req: any, @Body() body: any) {
        return this.developersService.createApp(req.user.id, body);
    }

    @Get(':id')
    async getApp(@Req() req: any, @Param('id') id: string) {
        return this.developersService.getApp(req.user.id, id);
    }

    @Patch(':id')
    async updateApp(@Req() req: any, @Param('id') id: string, @Body() body: any) {
        return this.developersService.updateAppMetadata(req.user.id, id, body);
    }

    @Delete(':id')
    async deleteApp(@Req() req: any, @Param('id') id: string) {
        return this.developersService.deleteApp(req.user.id, id);
    }

    @Post(':id/assets/upload-url')
    async getAssetUploadUrl(@Req() req: any, @Param('id') id: string, @Body() body: { type: string, mime: string }) {
        return this.developersService.generateUploadUrl(req.user.id, id, body.type, body.mime);
    }

    @Patch(':id/assets')
    async updateAssets(@Req() req: any, @Param('id') id: string, @Body() body: any) {
        return this.developersService.updateAppAssets(req.user.id, id, body);
    }

    @Post(':id/build/upload-url')
    async getBuildUploadUrl(@Req() req: any, @Param('id') id: string, @Body() body: { fileName: string, size: number }) {
        return this.developersService.generateUploadUrl(req.user.id, id, 'build', undefined, body.fileName, body.size);
    }

    @Post(':id/verify')
    async verifyApp(@Req() req: any, @Param('id') id: string, @Body() body: { verifyKey: string }) {
        return this.developersService.verifyApp(req.user.id, id, body.verifyKey);
    }

    @Post(':id/publish')
    async publishApp(@Req() req: any, @Param('id') id: string) {
        return this.developersService.publishAppStatus(req.user.id, id);
    }
}
