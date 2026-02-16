import { Controller, Get, Param, Query } from '@nestjs/common';
import { successResponse } from '../common/api-response';
import { ArtistsService } from './artists.service';

@Controller('artists')
export class ArtistsController {
  constructor(private readonly artistsService: ArtistsService) {}

  @Get()
  async getArtists(@Query('projectId') projectId?: string) {
    const artists = await this.artistsService.getArtists(projectId);
    return successResponse(artists);
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
}
