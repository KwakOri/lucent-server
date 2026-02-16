import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthSessionService } from '../auth/auth-session.service';
import { successResponse } from '../common/api-response';
import { ApiException } from '../common/errors/api.exception';
import { CartService } from './cart.service';

interface AddCartItemBody {
  product_id?: string;
  quantity?: number;
}

interface UpdateCartItemBody {
  quantity?: number;
}

@Controller('cart')
export class CartController {
  constructor(
    private readonly cartService: CartService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  @Get()
  async getCart(@Headers('authorization') authorization?: string) {
    const user = await this.authSessionService.requireUser(authorization);
    const summary = await this.cartService.getCartSummary(user.id);
    return successResponse(summary);
  }

  @Post()
  @HttpCode(201)
  async addItem(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: AddCartItemBody,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    const item = await this.cartService.addItem(
      user.id,
      body.product_id || '',
      body.quantity ?? 1,
    );

    return successResponse(item, '장바구니에 추가되었습니다');
  }

  @Delete()
  async clearCart(@Headers('authorization') authorization?: string) {
    const user = await this.authSessionService.requireUser(authorization);
    await this.cartService.clearCart(user.id);
    return successResponse(null, '장바구니가 비워졌습니다');
  }

  @Get('count')
  async getCartCount(@Headers('authorization') authorization?: string) {
    const user =
      await this.authSessionService.getUserFromAuthorizationHeader(
        authorization,
      );

    if (!user) {
      return successResponse({ count: 0 });
    }

    const count = await this.cartService.getCartCount(user.id);
    return successResponse({ count });
  }

  @Patch(':itemId')
  async updateCartItem(
    @Headers('authorization') authorization: string | undefined,
    @Param('itemId') itemId: string,
    @Body() body: UpdateCartItemBody,
  ) {
    const user = await this.authSessionService.requireUser(authorization);

    if (!Number.isInteger(body.quantity) || (body.quantity || 0) <= 0) {
      throw new ApiException(
        '올바른 수량을 입력해주세요',
        400,
        'VALIDATION_ERROR',
      );
    }

    const item = await this.cartService.updateItemQuantity(
      user.id,
      itemId,
      body.quantity,
    );

    return successResponse(item, '수량이 변경되었습니다');
  }

  @Delete(':itemId')
  async removeCartItem(
    @Headers('authorization') authorization: string | undefined,
    @Param('itemId') itemId: string,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    await this.cartService.removeItem(user.id, itemId);
    return successResponse(null, '장바구니에서 삭제되었습니다');
  }
}
