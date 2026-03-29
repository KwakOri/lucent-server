import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthSessionService } from '../auth/auth-session.service';
import { successResponse } from '../common/api-response';
import { ApiException } from '../common/errors/api.exception';
import { ArtistsService } from './artists.service';

interface CreateArtistBody {
  name?: string;
  slug?: string;
  project_id?: string;
  profile_image_id?: string | null;
  description?: string | null;
  is_active?: boolean;
}

interface UpdateArtistBody {
  name?: string;
  slug?: string;
  project_id?: string;
  profile_image_id?: string | null;
  description?: string | null;
  is_active?: boolean;
}

@Controller('artists')
export class ArtistsController {
  constructor(
    private readonly artistsService: ArtistsService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  @Get()
  async getArtists(
    @Headers('authorization') authorization: string | undefined,
    @Query('projectId') projectId?: string,
    @Query('isActive') isActiveParam?: string,
  ) {
    const { isActive, requiresAdmin } = this.parseIsActiveFilter(isActiveParam);
    if (requiresAdmin) {
      await this.requireAdmin(authorization);
    }

    const artists = await this.artistsService.getArtists({
      projectId,
      isActive,
    });
    return successResponse(artists);
  }

  @Post()
  async createArtist(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreateArtistBody,
  ) {
    await this.requireAdmin(authorization);

    if (!body.name || !body.slug || !body.project_id) {
      throw new ApiException(
        '이름, 슬러그, 프로젝트 ID는 필수입니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    const artist = await this.artistsService.createArtist({
      name: body.name,
      slug: body.slug,
      project_id: body.project_id,
      profile_image_id: body.profile_image_id,
      description: body.description,
      is_active: body.is_active,
    });

    return successResponse(artist);
  }

  @Get('slug/:slug')
  async getArtistBySlug(@Param('slug') slug: string) {
    const artist = await this.artistsService.getArtistBySlug(slug);
    return successResponse(artist);
  }

  @Get(':id')
  async getArtistById(@Param('id') id: string) {
    const artist = await this.artistsService.getArtistById(id);
    return successResponse(artist);
  }

  @Patch(':id')
  async updateArtist(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: UpdateArtistBody,
  ) {
    await this.requireAdmin(authorization);
    const artist = await this.artistsService.updateArtist(id, body);
    return successResponse(artist);
  }

  @Delete(':id')
  async deleteArtist(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ) {
    await this.requireAdmin(authorization);
    await this.artistsService.deleteArtist(id);
    return successResponse({ message: '아티스트가 삭제되었습니다' });
  }

  private parseIsActiveFilter(raw: string | undefined): {
    isActive?: boolean;
    requiresAdmin: boolean;
  } {
    if (!raw || raw === 'true') {
      return { isActive: true, requiresAdmin: false };
    }
    if (raw === 'false') {
      return { isActive: false, requiresAdmin: true };
    }
    if (raw === 'all') {
      return { isActive: undefined, requiresAdmin: true };
    }

    throw new ApiException(
      'isActive는 true, false, all 중 하나여야 합니다',
      400,
      'VALIDATION_ERROR',
    );
  }

  private async requireAdmin(authorization: string | undefined): Promise<void> {
    const user = await this.authSessionService.requireUser(authorization);
    const isAdmin = await this.authSessionService.isAdmin({
      userId: user.id,
      email: user.email,
    });
    if (!isAdmin) {
      throw new ApiException('관리자 권한이 필요합니다', 403, 'ADMIN_REQUIRED');
    }
  }
}
