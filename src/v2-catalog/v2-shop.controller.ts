import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { successResponse } from '../common/api-response';
import { ApiException } from '../common/errors/api.exception';
import { V2CatalogService } from './v2-catalog.service';

interface V2ShopPricePreviewBody {
  variant_id?: string;
  quantity?: number;
  campaign_id?: string | null;
  channel?: string | null;
  coupon_code?: string | null;
  user_id?: string | null;
  shipping_amount?: number | null;
}

@Controller('v2/shop')
export class V2ShopController {
  constructor(private readonly v2CatalogService: V2CatalogService) {}

  @Get('products')
  async getShopProducts(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
    @Query('channel') channel?: string,
    @Query('campaign_id') campaignIdSnake?: string,
    @Query('campaignId') campaignIdCamel?: string,
  ) {
    const products = await this.v2CatalogService.getShopProducts({
      cursor,
      limit: this.parseLimit(limit),
      sort,
      channel,
      campaign_id: campaignIdSnake ?? campaignIdCamel,
    });
    return successResponse(products);
  }

  @Get('products/:productId')
  async getShopProductDetail(
    @Param('productId') productId: string,
    @Query('channel') channel?: string,
    @Query('campaign_id') campaignIdSnake?: string,
    @Query('campaignId') campaignIdCamel?: string,
  ) {
    const detail = await this.v2CatalogService.getShopProductDetail(productId, {
      channel,
      campaign_id: campaignIdSnake ?? campaignIdCamel,
    });
    return successResponse(detail);
  }

  @Post('price-preview')
  async getShopPricePreview(@Body() body: V2ShopPricePreviewBody) {
    if (!body.variant_id) {
      throw new ApiException('variant_id는 필수입니다', 400, 'VALIDATION_ERROR');
    }
    const preview = await this.v2CatalogService.getShopPricePreview(body);
    return successResponse(preview);
  }

  private parseLimit(value?: string): number | undefined {
    if (value === undefined) {
      return undefined;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      throw new ApiException(
        'limit은 정수여야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    return parsed;
  }
}
