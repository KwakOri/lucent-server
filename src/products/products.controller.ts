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
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthSessionService } from '../auth/auth-session.service';
import { paginatedResponse, successResponse } from '../common/api-response';
import { ApiException } from '../common/errors/api.exception';
import { Database } from '../types/database';
import { GetProductsOptions, ProductsService } from './products.service';

type ProductType = Database['public']['Enums']['product_type'];

interface ProductQuery {
  ids?: string;
  page?: string;
  limit?: string;
  projectId?: string;
  type?: ProductType;
  isActive?: string;
  sortBy?: 'created_at' | 'price' | 'name';
  order?: 'asc' | 'desc';
}

interface CreateProductBody {
  name?: string;
  slug?: string;
  type?: ProductType;
  project_id?: string;
  main_image_id?: string | null;
  price?: number;
  description?: string | null;
  stock?: number | null;
  sample_audio_url?: string | null;
  digital_file_url?: string | null;
  is_active?: boolean;
}

interface UpdateProductBody {
  name?: string;
  slug?: string;
  type?: ProductType;
  project_id?: string;
  main_image_id?: string | null;
  price?: number;
  description?: string | null;
  stock?: number | null;
  sample_audio_url?: string | null;
  digital_file_url?: string | null;
  is_active?: boolean;
}

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  @Get()
  async getProducts(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ProductQuery,
  ) {
    if (query.ids) {
      const ids = query.ids
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);

      if (ids.length === 0) {
        return successResponse([]);
      }

      const products = await this.productsService.getProductsByIds(ids);
      return successResponse(products);
    }

    const page = this.parsePositiveInt(query.page, 1);
    const limit = this.parsePositiveInt(query.limit, 20);
    const { isActive, requiresAdmin } = this.parseIsActiveFilter(
      query.isActive,
    );
    if (requiresAdmin) {
      await this.requireAdmin(authorization);
    }

    const options: GetProductsOptions = {
      page,
      limit,
      projectId: query.projectId,
      type: query.type,
      isActive,
      sortBy: query.sortBy || 'created_at',
      order: query.order || 'desc',
    };

    const result = await this.productsService.getProducts(options);
    return paginatedResponse(result.products, {
      total: result.total,
      page,
      limit,
    });
  }

  @Post()
  async createProduct(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreateProductBody,
  ) {
    await this.requireAdmin(authorization);

    if (!body.name || !body.slug || !body.type || !body.project_id) {
      throw new ApiException(
        '상품명, 슬러그, 타입, 프로젝트 ID는 필수입니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    if (body.price === undefined) {
      throw new ApiException('가격은 필수입니다', 400, 'VALIDATION_ERROR');
    }

    const product = await this.productsService.createProduct({
      name: body.name,
      slug: body.slug,
      type: body.type,
      project_id: body.project_id,
      main_image_id: body.main_image_id,
      price: body.price,
      description: body.description,
      stock: body.stock,
      sample_audio_url: body.sample_audio_url,
      digital_file_url: body.digital_file_url,
      is_active: body.is_active,
    });

    return successResponse(product);
  }

  @Get('slug/:slug')
  async getProductBySlug(@Param('slug') slug: string) {
    const product = await this.productsService.getProductBySlug(slug);
    return successResponse(product);
  }

  @Get(':id/sample')
  async getSampleAudio(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const audioBuffer = await this.productsService.getSampleAudioBuffer(id);

    response.setHeader('Content-Type', 'audio/mpeg');
    response.setHeader('Content-Length', String(audioBuffer.byteLength));
    response.setHeader('Cache-Control', 'public, max-age=31536000');
    response.setHeader('Accept-Ranges', 'bytes');

    return audioBuffer;
  }

  @Get(':id')
  async getProductById(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Query('includePrivate') includePrivateParam?: string,
  ) {
    const includePrivate = includePrivateParam === 'true';
    if (includePrivate) {
      await this.requireAdmin(authorization);
    }

    const product = await this.productsService.getProductById(id, {
      includePrivate,
    });
    return successResponse(product);
  }

  @Patch(':id')
  async updateProduct(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: UpdateProductBody,
  ) {
    await this.requireAdmin(authorization);
    const product = await this.productsService.updateProduct(id, body);
    return successResponse(product);
  }

  @Delete(':id')
  async deleteProduct(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ) {
    await this.requireAdmin(authorization);
    await this.productsService.deleteProduct(id);
    return successResponse({ message: '상품이 삭제되었습니다' });
  }

  private parsePositiveInt(raw: string | undefined, fallback: number): number {
    if (!raw) {
      return fallback;
    }

    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new ApiException(`Invalid number: ${raw}`, 400, 'VALIDATION_ERROR');
    }

    return parsed;
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
    if (!this.authSessionService.isAdmin(user.email)) {
      throw new ApiException('관리자 권한이 필요합니다', 403, 'ADMIN_REQUIRED');
    }
  }
}
