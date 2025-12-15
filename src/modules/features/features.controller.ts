import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FeaturesService } from './features.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('features')
@ApiBearerAuth()
@Controller('features')
export class FeaturesController {
  constructor(private readonly featuresService: FeaturesService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get()
  async getAllFeatures() {
    return this.featuresService.findAll();
  }

  @UseGuards(AuthGuard('jwt'))
  @Post()
  async createFeature(@Body() data: any) {
    return this.featuresService.create(data);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':id')
  async updateFeature(@Param('id') id: string, @Body() data: any) {
    return this.featuresService.update(id, data);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async getMyFeatures(@Req() req: any) {
    const userId = req.user.id;
    return this.featuresService.getUserFeatures(userId);
  }
}
