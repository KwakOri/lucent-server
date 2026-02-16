import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';
import { Database } from '../types/database';

type ProductType = Database['public']['Enums']['product_type'];

export interface GetProductsOptions {
  page?: number;
  limit?: number;
  projectId?: string;
  type?: ProductType;
  isActive?: boolean;
  sortBy?: 'created_at' | 'price' | 'name';
  order?: 'asc' | 'desc';
}

@Injectable()
export class ProductsService {
  async getProducts(options: GetProductsOptions = {}): Promise<{ products: any[]; total: number }> {
    const supabase = getSupabaseClient();
    const {
      page = 1,
      limit = 20,
      projectId,
      type,
      isActive = true,
      sortBy = 'created_at',
      order = 'desc',
    } = options;

    let query = supabase
      .from('products')
      .select(
        `
        id,
        name,
        slug,
        description,
        price,
        type,
        stock,
        is_active,
        project_id,
        main_image_id,
        sample_audio_url,
        created_at,
        updated_at,
        project:projects (
          id,
          name,
          slug
        ),
        main_image:images!products_main_image_id_fkey (
          id,
          r2_key,
          public_url,
          cdn_url,
          alt_text
        )
      `,
        { count: 'exact' },
      );

    if (isActive !== undefined) {
      query = query.eq('is_active', isActive);
    }
    if (projectId) {
      query = query.eq('project_id', projectId);
    }
    if (type) {
      query = query.eq('type', type);
    }

    query = query.order(sortBy, { ascending: order === 'asc' });

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) {
      throw new ApiException(`상품 목록 조회 실패: ${error.message}`, 500, 'PRODUCTS_FETCH_FAILED');
    }

    return {
      products: data || [],
      total: count || 0,
    };
  }

  async getProductsByIds(ids: string[]): Promise<any[]> {
    if (ids.length === 0) {
      return [];
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('products')
      .select(
        `
        id,
        name,
        slug,
        description,
        price,
        type,
        stock,
        is_active,
        project_id,
        main_image_id,
        sample_audio_url,
        created_at,
        updated_at,
        project:projects (
          id,
          name,
          slug
        ),
        main_image:images!products_main_image_id_fkey (
          id,
          r2_key,
          public_url,
          cdn_url,
          alt_text
        )
      `,
      )
      .in('id', ids)
      .eq('is_active', true);

    if (error) {
      throw new ApiException('상품 조회 실패', 500, 'PRODUCTS_FETCH_FAILED');
    }

    return data || [];
  }

  async getProductById(id: string): Promise<any> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('products')
      .select(
        `
        id,
        name,
        slug,
        description,
        price,
        type,
        stock,
        is_active,
        project_id,
        main_image_id,
        sample_audio_url,
        created_at,
        updated_at,
        project:projects (
          id,
          name,
          slug,
          description
        ),
        main_image:images!products_main_image_id_fkey (
          id,
          r2_key,
          public_url,
          cdn_url,
          alt_text
        ),
        gallery_images:product_images!product_images_product_id_fkey (
          display_order,
          image:images!product_images_image_id_fkey (
            id,
            r2_key,
            public_url,
            cdn_url,
            alt_text
          )
        )
      `,
      )
      .eq('id', id)
      .single();

    if (error && error.code === 'PGRST116') {
      throw new ApiException('상품을 찾을 수 없습니다', 404, 'PRODUCT_NOT_FOUND');
    }
    if (error) {
      throw new ApiException('상품 조회 실패', 500, 'PRODUCT_FETCH_FAILED');
    }

    return data;
  }

  async getProductBySlug(slug: string): Promise<any> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('products')
      .select(
        `
        id,
        name,
        slug,
        description,
        price,
        type,
        stock,
        is_active,
        project_id,
        main_image_id,
        sample_audio_url,
        created_at,
        updated_at,
        project:projects (
          id,
          name,
          slug
        ),
        main_image:images!products_main_image_id_fkey (
          id,
          r2_key,
          public_url,
          cdn_url,
          alt_text
        )
      `,
      )
      .eq('slug', slug)
      .single();

    if (error && error.code === 'PGRST116') {
      throw new ApiException('상품을 찾을 수 없습니다', 404, 'PRODUCT_NOT_FOUND');
    }
    if (error) {
      throw new ApiException('상품 조회 실패', 500, 'PRODUCT_FETCH_FAILED');
    }

    return data;
  }

  async getSampleAudioBuffer(id: string): Promise<Buffer> {
    const product = await this.getProductById(id);

    if (!product.sample_audio_url) {
      throw new ApiException('샘플 오디오가 제공되지 않는 상품입니다', 404, 'SAMPLE_NOT_FOUND');
    }

    const audioResponse = await fetch(product.sample_audio_url);
    if (!audioResponse.ok) {
      throw new ApiException('샘플 오디오를 불러올 수 없습니다', 500, 'SAMPLE_FETCH_FAILED');
    }

    const buffer = await audioResponse.arrayBuffer();
    return Buffer.from(buffer);
  }
}
