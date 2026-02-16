import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';
import { Enums, Tables } from '../types/database';

type CartItem = Tables<'cart_items'>;

type ProductSummary = {
  id: string;
  name: string;
  price: number;
  type: Enums<'product_type'>;
  stock: number | null;
  is_active: boolean;
  main_image?: {
    id: string;
    public_url: string;
    cdn_url: string | null;
    alt_text: string | null;
  } | null;
};

export interface CartItemWithProduct extends CartItem {
  product: ProductSummary | null;
}

export interface CartSummary {
  items: CartItemWithProduct[];
  count: number;
  totalPrice: number;
}

@Injectable()
export class CartService {
  async getCart(userId: string): Promise<CartItemWithProduct[]> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('cart_items')
      .select(
        `
        *,
        product:products (
          id,
          name,
          price,
          type,
          stock,
          is_active,
          main_image:images!products_main_image_id_fkey (
            id,
            public_url,
            cdn_url,
            alt_text
          )
        )
      `,
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new ApiException('장바구니 조회 실패', 500, 'CART_FETCH_FAILED');
    }

    return (data || []) as CartItemWithProduct[];
  }

  async getCartSummary(userId: string): Promise<CartSummary> {
    const items = await this.getCart(userId);
    const totalPrice = items.reduce((sum, item) => {
      const unitPrice = item.product?.price || 0;
      return sum + unitPrice * item.quantity;
    }, 0);

    return {
      items,
      count: items.length,
      totalPrice,
    };
  }

  async addItem(
    userId: string,
    productId: string,
    quantity = 1,
  ): Promise<CartItemWithProduct> {
    if (!productId) {
      throw new ApiException('상품 ID가 필요합니다', 400, 'VALIDATION_ERROR');
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ApiException(
        '올바른 수량을 입력해주세요',
        400,
        'VALIDATION_ERROR',
      );
    }

    const supabase = getSupabaseClient();

    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, name, price, type, stock, is_active')
      .eq('id', productId)
      .maybeSingle();

    if (productError) {
      throw new ApiException('상품 조회 실패', 500, 'PRODUCT_FETCH_FAILED');
    }

    if (!product) {
      throw new ApiException(
        '상품을 찾을 수 없습니다',
        404,
        'PRODUCT_NOT_FOUND',
      );
    }

    if (!product.is_active) {
      throw new ApiException('판매 중단된 상품입니다', 400, 'PRODUCT_INACTIVE');
    }

    if (product.type === 'PHYSICAL_GOODS' && product.stock !== null) {
      if (product.stock <= 0) {
        throw new ApiException('품절된 상품입니다', 400, 'OUT_OF_STOCK');
      }
      if (quantity > product.stock) {
        throw new ApiException(
          `재고가 부족합니다 (남은 재고: ${product.stock}개)`,
          400,
          'INSUFFICIENT_STOCK',
        );
      }
    }

    const { data: existingItem, error: existingError } = await supabase
      .from('cart_items')
      .select('*')
      .eq('user_id', userId)
      .eq('product_id', productId)
      .maybeSingle();

    if (existingError) {
      throw new ApiException('장바구니 확인 실패', 500, 'CART_CHECK_FAILED');
    }

    if (existingItem) {
      const nextQuantity = existingItem.quantity + quantity;
      return this.updateItemQuantity(userId, existingItem.id, nextQuantity);
    }

    const { data: inserted, error: insertError } = await supabase
      .from('cart_items')
      .insert({
        user_id: userId,
        product_id: productId,
        quantity,
      })
      .select(
        `
        *,
        product:products (
          id,
          name,
          price,
          type,
          stock,
          is_active,
          main_image:images!products_main_image_id_fkey (
            id,
            public_url,
            cdn_url,
            alt_text
          )
        )
      `,
      )
      .maybeSingle();

    if (insertError || !inserted) {
      throw new ApiException(
        '장바구니 추가 실패',
        500,
        'CART_ITEM_CREATE_FAILED',
      );
    }

    return inserted as CartItemWithProduct;
  }

  async updateItemQuantity(
    userId: string,
    itemId: string,
    quantity: number,
  ): Promise<CartItemWithProduct> {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ApiException(
        '수량은 1개 이상이어야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    const supabase = getSupabaseClient();

    const { data: item, error: itemError } = await supabase
      .from('cart_items')
      .select(
        `
        *,
        product:products (
          id,
          name,
          price,
          type,
          stock,
          is_active
        )
      `,
      )
      .eq('id', itemId)
      .eq('user_id', userId)
      .maybeSingle();

    if (itemError) {
      throw new ApiException(
        '장바구니 아이템 조회 실패',
        500,
        'CART_ITEM_FETCH_FAILED',
      );
    }

    if (!item) {
      throw new ApiException(
        '장바구니 아이템을 찾을 수 없습니다',
        404,
        'CART_ITEM_NOT_FOUND',
      );
    }

    if (
      item.product &&
      item.product.type === 'PHYSICAL_GOODS' &&
      item.product.stock !== null &&
      quantity > item.product.stock
    ) {
      throw new ApiException(
        `재고가 부족합니다 (남은 재고: ${item.product.stock}개)`,
        400,
        'INSUFFICIENT_STOCK',
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from('cart_items')
      .update({ quantity })
      .eq('id', itemId)
      .eq('user_id', userId)
      .select(
        `
        *,
        product:products (
          id,
          name,
          price,
          type,
          stock,
          is_active,
          main_image:images!products_main_image_id_fkey (
            id,
            public_url,
            cdn_url,
            alt_text
          )
        )
      `,
      )
      .maybeSingle();

    if (updateError) {
      throw new ApiException(
        '장바구니 수량 변경 실패',
        500,
        'CART_ITEM_UPDATE_FAILED',
      );
    }

    if (!updated) {
      throw new ApiException(
        '장바구니 아이템을 찾을 수 없습니다',
        404,
        'CART_ITEM_NOT_FOUND',
      );
    }

    return updated as CartItemWithProduct;
  }

  async removeItem(userId: string, itemId: string): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('id', itemId)
      .eq('user_id', userId);

    if (error) {
      throw new ApiException(
        '장바구니 아이템 삭제 실패',
        500,
        'CART_ITEM_DELETE_FAILED',
      );
    }
  }

  async clearCart(userId: string): Promise<void> {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .eq('user_id', userId);

    if (error) {
      throw new ApiException('장바구니 비우기 실패', 500, 'CART_CLEAR_FAILED');
    }
  }

  async getCartCount(userId: string): Promise<number> {
    const supabase = getSupabaseClient();
    const { count, error } = await supabase
      .from('cart_items')
      .select('*', { head: true, count: 'exact' })
      .eq('user_id', userId);

    if (error) {
      throw new ApiException(
        '장바구니 개수 조회 실패',
        500,
        'CART_COUNT_FETCH_FAILED',
      );
    }

    return count || 0;
  }
}
