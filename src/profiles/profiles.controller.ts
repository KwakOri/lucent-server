import { Body, Controller, Get, Headers, Param, Patch } from '@nestjs/common';
import { successResponse } from '../common/api-response';
import { AuthSessionService } from '../auth/auth-session.service';
import { ProfilesService } from './profiles.service';

interface UpdateProfileBody {
  name?: string | null;
  phone?: string | null;
  main_address?: string | null;
  detail_address?: string | null;
}

@Controller('profiles')
export class ProfilesController {
  constructor(
    private readonly profilesService: ProfilesService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  @Get()
  async getMyProfileFromRoot(@Headers('authorization') authorization?: string) {
    const user = await this.authSessionService.requireUser(authorization);
    const profile = await this.profilesService.getProfile(user.id);
    return successResponse(profile);
  }

  @Get('me')
  async getMyProfile(@Headers('authorization') authorization?: string) {
    const user = await this.authSessionService.requireUser(authorization);
    const profile = await this.profilesService.getProfile(user.id);
    return successResponse(profile);
  }

  @Patch('me')
  async updateMyProfile(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: UpdateProfileBody,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const updatedProfile = await this.profilesService.updateProfile(
      user.id,
      user.id,
      body,
    );
    return successResponse(updatedProfile, '프로필이 업데이트되었습니다');
  }

  @Get(':id')
  async getProfileById(@Param('id') id: string) {
    const profile = await this.profilesService.getProfile(id);
    return successResponse(profile);
  }

  @Patch(':id')
  async updateProfileById(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: UpdateProfileBody,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const updatedProfile = await this.profilesService.updateProfile(
      id,
      user.id,
      body,
    );
    return successResponse(updatedProfile);
  }
}
