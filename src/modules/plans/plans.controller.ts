import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PlansService } from './plans.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('plans')
@ApiBearerAuth()
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  async getAllPlans() {
    return this.plansService.findAll();
  }

  @UseGuards(AuthGuard('jwt'))
  @Post()
  async createPlan(@Body() data: any) {
    return this.plansService.create(data);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':id')
  async updatePlan(@Param('id') id: string, @Body() data: any) {
    return this.plansService.update(id, data);
  }

  @Get(':id')
  async getPlan(@Param('id') id: string) {
    return this.plansService.findOneById(id);
  }

  @Get('code/:code')
  async getPlanByCode(@Param('code') code: string) {
    return this.plansService.findOneByCode(code);
  }
}
