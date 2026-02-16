import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthSessionService } from '../auth/auth-session.service';
import { ApiException } from '../common/errors/api.exception';
import { successResponse } from '../common/api-response';
import { ImagesService } from './images.service';

type ImageType =
  | 'project_cover'
  | 'artist_profile'
  | 'product_main'
  | 'product_gallery';

interface UploadBody {
  image_type?: ImageType;
  alt_text?: string;
}

@Controller('images')
export class ImagesController {
  constructor(
    private readonly imagesService: ImagesService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  @Get()
  async getImages(
    @Headers('authorization') authorization: string | undefined,
    @Query('page') rawPage?: string,
    @Query('limit') rawLimit?: string,
    @Query('image_type') imageType?: string,
    @Query('is_active') isActiveParam?: string,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    this.requireAdmin(user.email);

    const page = this.parseOrDefault(rawPage, 1);
    const limit = this.parseOrDefault(rawLimit, 20);
    const isActive = isActiveParam ? isActiveParam === 'true' : undefined;

    const result = await this.imagesService.getImages({
      page,
      limit,
      imageType,
      isActive,
    });

    return successResponse({
      images: result.images,
      pagination: {
        total: result.total,
        page,
        limit,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  async uploadImage(
    @Headers('authorization') authorization: string | undefined,
    @UploadedFile() file: any,
    @Body() body: UploadBody,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    this.requireAdmin(user.email);

    if (!file) {
      throw new ApiException(
        '파일이 제공되지 않았습니다',
        400,
        'FILE_REQUIRED',
      );
    }
    if (!body.image_type) {
      throw new ApiException(
        'image_type이 제공되지 않았습니다',
        400,
        'IMAGE_TYPE_REQUIRED',
      );
    }

    const validTypes: ImageType[] = [
      'project_cover',
      'artist_profile',
      'product_main',
      'product_gallery',
    ];
    if (!validTypes.includes(body.image_type)) {
      throw new ApiException(
        '유효하지 않은 image_type입니다',
        400,
        'INVALID_IMAGE_TYPE',
      );
    }

    const image = await this.imagesService.uploadImage({
      file: {
        buffer: file.buffer as Buffer,
        originalname: file.originalname as string,
        mimetype: file.mimetype as string,
        size: file.size as number,
      },
      imageType: body.image_type,
      altText: body.alt_text,
      uploadedBy: user.id,
    });

    return successResponse(
      {
        id: image.id,
        public_url: image.public_url,
        file_name: image.file_name,
        file_size: image.file_size,
        width: image.width,
        height: image.height,
        image_type: image.image_type,
        created_at: image.created_at,
      },
      undefined,
    );
  }

  @Get(':id')
  async getImageById(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ) {
    await this.authSessionService.requireUser(authorization);
    const image = await this.imagesService.getImageById(id);
    return successResponse(image);
  }

  @Delete(':id')
  async deleteImage(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    this.requireAdmin(user.email);

    await this.imagesService.softDeleteImage(id);
    return successResponse({ message: '이미지가 비활성화되었습니다' });
  }

  private parseOrDefault(raw: string | undefined, fallback: number): number {
    if (!raw) {
      return fallback;
    }

    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new ApiException(
        '유효하지 않은 숫자 값입니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    return parsed;
  }

  private requireAdmin(email?: string | null): void {
    if (!this.authSessionService.isAdmin(email)) {
      throw new ApiException('관리자 권한이 필요합니다', 403, 'ADMIN_REQUIRED');
    }
  }
}
