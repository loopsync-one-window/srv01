import {
  Controller,
  Get,
  Query,
  UseGuards,
  Post,
  Body,
  Req,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Patch,
  Param,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('search')
  @ApiOperation({ summary: 'Search users by email, ID, or phone number' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully.' })
  @ApiBearerAuth()
  async searchUsers(@Query('q') searchTerm: string) {
    return this.usersService.searchUsers(searchTerm);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':userId/onboard')
  @ApiBearerAuth()
  async getOnboard(@Param('userId') userId: string) {
    return this.usersService.getOnboardStatus(userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':userId/onboard')
  @ApiBearerAuth()
  async updateOnboard(@Param('userId') userId: string, @Body() body: any) {
    const onboard = body?.onboard;
    return this.usersService.updateOnboardStatus(userId, onboard);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get(':userId/trial-notify')
  @ApiBearerAuth()
  async getTrialNotify(@Param('userId') userId: string) {
    return this.usersService.getTrialNotifyStatus(userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch(':userId/trial-notify')
  @ApiBearerAuth()
  async updateTrialNotify(@Param('userId') userId: string, @Body() body: any) {
    const trialNotify = body?.trialNotify;
    return this.usersService.updateTrialNotifyStatus(userId, trialNotify);
  }
}

@ApiTags('profile')
@Controller('profile')
export class ProfileController {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  @ApiBearerAuth()
  async getMe(@Req() req: any) {
    const userId = req.user.id;
    return this.usersService.getProfile(userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('change-password')
  @ApiBearerAuth()
  async changePassword(@Req() req: any, @Body() body: any) {
    const userId = req.user.id;
    const { newPassword, confirmPassword } = body || {};
    if (!newPassword || !confirmPassword || newPassword !== confirmPassword) {
      return { success: false, message: 'Invalid password data' };
    }
    await this.usersService.updatePassword(userId, newPassword);
    return { success: true };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('request-deletion-otp')
  @ApiBearerAuth()
  async requestDeletionOtp(@Req() req: any) {
    const userId = req.user.id;
    return this.usersService.requestDeletionOtp(userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('confirm-deletion')
  @ApiBearerAuth()
  async confirmDeletion(@Req() req: any, @Body() body: any) {
    const userId = req.user.id;
    const { code } = body || {};
    if (!code) {
      return { success: false, message: 'Code is required' };
    }
    return this.usersService.confirmDeletion(userId, code);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('preferences')
  @ApiBearerAuth()
  async getPreferences(@Req() req: any) {
    const userId = req.user.id;
    const prefs = await this.usersService.getPreferences(userId);
    return {
      notifications: prefs.notifications ? 'active' : 'disabled',
      musicExperience: prefs.musicExperience ? 'active' : 'disabled',
      emergencyLockdown: prefs.emergencyLockdown ? 'active' : 'disabled',
      stabilityMode: prefs.stabilityMode ? 'active' : 'disabled',
    };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('preferences/notifications')
  @ApiBearerAuth()
  async setNotifications(@Req() req: any, @Body() body: any) {
    const userId = req.user.id;
    const value = !!body?.value;
    await this.usersService.setNotifications(userId, value);
    return { success: true, status: value ? 'active' : 'disabled' };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('preferences/music-experience')
  @ApiBearerAuth()
  async setMusicExperience(@Req() req: any, @Body() body: any) {
    const userId = req.user.id;
    const value = !!body?.value;
    await this.usersService.setMusicExperience(userId, value);
    return { success: true, status: value ? 'active' : 'disabled' };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('preferences/emergency-lockdown')
  @ApiBearerAuth()
  async setEmergencyLockdown(@Req() req: any, @Body() body: any) {
    const userId = req.user.id;
    const value = !!body?.value;
    await this.usersService.setEmergencyLockdown(userId, value);
    return { success: true, status: value ? 'active' : 'disabled' };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('preferences/stability-mode')
  @ApiBearerAuth()
  async setStabilityMode(@Req() req: any, @Body() body: any) {
    const userId = req.user.id;
    const value = !!body?.value;
    await this.usersService.setStabilityMode(userId, value);
    return { success: true, status: value ? 'active' : 'disabled' };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('preferences/notifications')
  @ApiBearerAuth()
  async getNotifications(@Req() req: any) {
    const userId = req.user.id;
    const value = await this.usersService.getNotifications(userId);
    return { success: true, status: value ? 'active' : 'disabled' };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('preferences/music-experience')
  @ApiBearerAuth()
  async getMusicExperience(@Req() req: any) {
    const userId = req.user.id;
    const value = await this.usersService.getMusicExperience(userId);
    return { success: true, status: value ? 'active' : 'disabled' };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('preferences/emergency-lockdown')
  @ApiBearerAuth()
  async getEmergencyLockdown(@Req() req: any) {
    const userId = req.user.id;
    const value = await this.usersService.getEmergencyLockdown(userId);
    return { success: true, status: value ? 'active' : 'disabled' };
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('preferences/stability-mode')
  @ApiBearerAuth()
  async getStabilityMode(@Req() req: any) {
    const userId = req.user.id;
    const value = await this.usersService.getStabilityMode(userId);
    return { success: true, status: value ? 'active' : 'disabled' };
  }

  @Get('models/status')
  @ApiBearerAuth()
  async getModels(@Req() req: any, @Query('email') email?: string) {
    const allowedKeys = new Set(['atlas.access.ATLAS001ARCT']);
    const pepronKey = String(req.headers['x-pepron-key'] || '');
    const authHeader = String(req.headers['authorization'] || '');

    let userId: string | null = null;

    if (pepronKey && allowedKeys.has(pepronKey)) {
      if (!email) {
        throw new BadRequestException(
          'Email is required when using X-Pepron-Key',
        );
      }
      const user = await this.usersService.findOneByEmail(email);
      if (!user) {
        throw new NotFoundException('User not found');
      }
      userId = user.id;
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const payload: any = this.jwtService.verify(token);
        userId = payload?.sub;
      } catch (e) {
        throw new UnauthorizedException('Invalid access token');
      }
    } else {
      throw new UnauthorizedException('Missing Authorization or X-Pepron-Key');
    }

    const models = await this.usersService.getModels(userId!);
    return {
      computeMax: models.computeMax ? 'active' : 'disabled',
      r3Advanced: models.r3Advanced ? 'active' : 'disabled',
      visionPro: models.visionPro ? 'active' : 'disabled',
    };
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('models')
  @ApiBearerAuth()
  async setModels(@Req() req: any, @Body() body: any) {
    const userId = req.user.id;
    const computeMax = body?.computeMax;
    const r3Advanced = body?.r3Advanced;
    const visionPro = body?.visionPro;

    if (typeof computeMax === 'boolean') {
      await this.usersService.setComputeMax(userId, computeMax);
    }
    if (typeof r3Advanced === 'boolean') {
      await this.usersService.setR3Advanced(userId, r3Advanced);
    }
    if (typeof visionPro === 'boolean') {
      await this.usersService.setVisionPro(userId, visionPro);
    }

    const updated = await this.usersService.getModels(userId);
    return {
      success: true,
      computeMax: updated.computeMax ? 'active' : 'disabled',
      r3Advanced: updated.r3Advanced ? 'active' : 'disabled',
      visionPro: updated.visionPro ? 'active' : 'disabled',
    };
  }
}
