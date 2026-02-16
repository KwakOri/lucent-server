import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
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

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async getProducts(@Query() query: ProductQuery) {
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
    const options: GetProductsOptions = {
      page,
      limit,
      projectId: query.projectId,
      type: query.type,
      isActive: query.isActive === 'false' ? false : true,
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

  @Get('slug/:slug')
  async getProductBySlug(@Param('slug') slug: string) {
    const product = await this.productsService.getProductBySlug(slug);
    return successResponse(product);
  }

  @Get(':id/sample')
  async getSampleAudio(@Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    const audioBuffer = await this.productsService.getSampleAudioBuffer(id);

    response.setHeader('Content-Type', 'audio/mpeg');
    response.setHeader('Content-Length', String(audioBuffer.byteLength));
    response.setHeader('Cache-Control', 'public, max-age=31536000');
    response.setHeader('Accept-Ranges', 'bytes');

    return audioBuffer;
  }

  @Get(':id')
  async getProductById(@Param('id') id: string) {
    const product = await this.productsService.getProductById(id);
    return successResponse(product);
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
}
