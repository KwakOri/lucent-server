import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';
import {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
} from '../types/database';

type ProductType = Database['public']['Enums']['product_type'];
type Product = Tables<'products'>;

export interface GetProductsOptions {
  page?: number;
  limit?: number;
  projectId?: string;
  type?: ProductType;
  isActive?: boolean;
  sortBy?: 'created_at' | 'price' | 'name';
  order?: 'asc' | 'desc';
}

interface CreateProductInput {
  name: string;
  slug: string;
  type: ProductType;
  project_id: string;
  main_image_id?: string | null;
  price: number;
  description?: string | null;
  stock?: number | null;
  sample_audio_url?: string | null;
  digital_file_url?: string | null;
  is_active?: boolean;
}

interface UpdateProductInput {
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

interface ProductByIdOptions {
  includePrivate?: boolean;
}

@Injectable()
export class ProductsService {
  async getProducts(
    options: GetProductsOptions = {},
  ): Promise<{ products: any[]; total: number }> {
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

    let query = supabase.from('products').select(
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
      throw new ApiException(
        `상품 목록 조회 실패: ${error.message}`,
        500,
        'PRODUCTS_FETCH_FAILED',
      );
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

  async getProductById(
    id: string,
    options: ProductByIdOptions = {},
  ): Promise<any> {
    const supabase = getSupabaseClient();
    const privateFields = options.includePrivate
      ? '\n        digital_file_url,'
      : '';

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
        sample_audio_url,${privateFields}
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
      throw new ApiException(
        '상품을 찾을 수 없습니다',
        404,
        'PRODUCT_NOT_FOUND',
      );
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
      throw new ApiException(
        '상품을 찾을 수 없습니다',
        404,
        'PRODUCT_NOT_FOUND',
      );
    }
    if (error) {
      throw new ApiException('상품 조회 실패', 500, 'PRODUCT_FETCH_FAILED');
    }

    return data;
  }

  async createProduct(productData: CreateProductInput): Promise<Product> {
    const supabase = getSupabaseClient();
    const name = this.normalizeRequired(
      productData.name,
      '상품명은 필수입니다',
    );
    const slug = this.normalizeRequired(
      productData.slug,
      '상품 슬러그는 필수입니다',
    );
    const projectId = this.normalizeRequired(
      productData.project_id,
      '프로젝트 ID는 필수입니다',
    );

    this.assertValidPrice(productData.price);
    this.assertValidType(productData.type);
    this.assertValidStock(productData.stock);

    const { data: duplicate, error: duplicateError } = await supabase
      .from('products')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (duplicateError) {
      throw new ApiException(
        '상품 중복 검사에 실패했습니다',
        500,
        'PRODUCT_FETCH_FAILED',
      );
    }
    if (duplicate) {
      throw new ApiException(
        '이미 사용 중인 슬러그입니다',
        409,
        'SLUG_ALREADY_EXISTS',
      );
    }

    await this.ensureProjectExists(projectId);

    const mainImageId = this.normalizeNullable(productData.main_image_id);
    if (mainImageId) {
      await this.ensureImageExists(mainImageId);
    }

    const insertData: TablesInsert<'products'> = {
      name,
      slug,
      type: productData.type,
      project_id: projectId,
      main_image_id: mainImageId,
      price: productData.price,
      description: this.normalizeNullable(productData.description),
      stock: this.normalizeStock(productData.stock),
      sample_audio_url: this.normalizeNullable(productData.sample_audio_url),
      digital_file_url: this.normalizeNullable(productData.digital_file_url),
      is_active: productData.is_active ?? true,
    };

    const { data, error } = await supabase
      .from('products')
      .insert(insertData)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException('상품 생성 실패', 500, 'PRODUCT_CREATE_FAILED');
    }

    return data;
  }

  async updateProduct(
    id: string,
    productData: UpdateProductInput,
  ): Promise<Product> {
    const supabase = getSupabaseClient();
    const { data: existing, error: existingError } = await supabase
      .from('products')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (existingError) {
      throw new ApiException('상품 조회 실패', 500, 'PRODUCT_FETCH_FAILED');
    }
    if (!existing) {
      throw new ApiException(
        '상품을 찾을 수 없습니다',
        404,
        'PRODUCT_NOT_FOUND',
      );
    }

    let normalizedSlug: string | undefined;
    if (productData.slug !== undefined) {
      normalizedSlug = this.normalizeRequired(
        productData.slug,
        '상품 슬러그는 필수입니다',
      );
      const { data: duplicate, error: duplicateError } = await supabase
        .from('products')
        .select('id')
        .eq('slug', normalizedSlug)
        .neq('id', id)
        .maybeSingle();

      if (duplicateError) {
        throw new ApiException(
          '상품 중복 검사에 실패했습니다',
          500,
          'PRODUCT_FETCH_FAILED',
        );
      }
      if (duplicate) {
        throw new ApiException(
          '이미 사용 중인 슬러그입니다',
          409,
          'SLUG_ALREADY_EXISTS',
        );
      }
    }

    let normalizedProjectId: string | undefined;
    if (productData.project_id !== undefined) {
      normalizedProjectId = this.normalizeRequired(
        productData.project_id,
        '프로젝트 ID는 필수입니다',
      );
      await this.ensureProjectExists(normalizedProjectId);
    }

    let normalizedMainImageId: string | null | undefined;
    if (productData.main_image_id !== undefined) {
      normalizedMainImageId = this.normalizeNullable(productData.main_image_id);
      if (normalizedMainImageId) {
        await this.ensureImageExists(normalizedMainImageId);
      }
    }

    if (productData.price !== undefined) {
      this.assertValidPrice(productData.price);
    }
    if (productData.type !== undefined) {
      this.assertValidType(productData.type);
    }
    if (productData.stock !== undefined) {
      this.assertValidStock(productData.stock);
    }

    const updateData: TablesUpdate<'products'> = {};

    if (productData.name !== undefined) {
      updateData.name = this.normalizeRequired(
        productData.name,
        '상품명은 필수입니다',
      );
    }
    if (normalizedSlug !== undefined) {
      updateData.slug = normalizedSlug;
    }
    if (productData.type !== undefined) {
      updateData.type = productData.type;
    }
    if (normalizedProjectId !== undefined) {
      updateData.project_id = normalizedProjectId;
    }
    if (normalizedMainImageId !== undefined) {
      updateData.main_image_id = normalizedMainImageId;
    }
    if (productData.price !== undefined) {
      updateData.price = productData.price;
    }
    if (productData.description !== undefined) {
      updateData.description = this.normalizeNullable(productData.description);
    }
    if (productData.stock !== undefined) {
      updateData.stock = this.normalizeStock(productData.stock);
    }
    if (productData.sample_audio_url !== undefined) {
      updateData.sample_audio_url = this.normalizeNullable(
        productData.sample_audio_url,
      );
    }
    if (productData.digital_file_url !== undefined) {
      updateData.digital_file_url = this.normalizeNullable(
        productData.digital_file_url,
      );
    }
    if (productData.is_active !== undefined) {
      updateData.is_active = productData.is_active;
    }

    if (Object.keys(updateData).length === 0) {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        throw new ApiException('상품 조회 실패', 500, 'PRODUCT_FETCH_FAILED');
      }

      return data;
    }

    const { data, error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException('상품 수정 실패', 500, 'PRODUCT_UPDATE_FAILED');
    }

    return data;
  }

  async deleteProduct(id: string): Promise<void> {
    const supabase = getSupabaseClient();
    const { data: existing, error: existingError } = await supabase
      .from('products')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (existingError) {
      throw new ApiException('상품 조회 실패', 500, 'PRODUCT_FETCH_FAILED');
    }
    if (!existing) {
      throw new ApiException(
        '상품을 찾을 수 없습니다',
        404,
        'PRODUCT_NOT_FOUND',
      );
    }

    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      throw new ApiException('상품 삭제 실패', 500, 'PRODUCT_DELETE_FAILED');
    }
  }

  async getSampleAudioBuffer(id: string): Promise<Buffer> {
    const product = await this.getProductById(id);

    if (!product.sample_audio_url) {
      throw new ApiException(
        '샘플 오디오가 제공되지 않는 상품입니다',
        404,
        'SAMPLE_NOT_FOUND',
      );
    }

    const audioResponse = await fetch(product.sample_audio_url);
    if (!audioResponse.ok) {
      throw new ApiException(
        '샘플 오디오를 불러올 수 없습니다',
        500,
        'SAMPLE_FETCH_FAILED',
      );
    }

    const buffer = await audioResponse.arrayBuffer();
    return Buffer.from(buffer);
  }

  private normalizeRequired(
    value: string | null | undefined,
    message: string,
  ): string {
    const normalized = this.normalizeNullable(value);
    if (!normalized) {
      throw new ApiException(message, 400, 'VALIDATION_ERROR');
    }

    return normalized;
  }

  private normalizeNullable(value: string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeStock(stock: number | null | undefined): number | null {
    if (stock === undefined || stock === null) {
      return null;
    }

    return stock;
  }

  private assertValidPrice(price: number): void {
    if (!Number.isFinite(price) || price < 0) {
      throw new ApiException(
        '가격은 0 이상의 숫자여야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertValidType(type: ProductType): void {
    const validTypes: ProductType[] = [
      'VOICE_PACK',
      'PHYSICAL_GOODS',
      'BUNDLE',
    ];
    if (!validTypes.includes(type)) {
      throw new ApiException(
        '유효하지 않은 상품 타입입니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertValidStock(stock: number | null | undefined): void {
    if (stock === null || stock === undefined) {
      return;
    }

    if (!Number.isInteger(stock) || stock < 0) {
      throw new ApiException(
        '재고는 0 이상의 정수여야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private async ensureProjectExists(projectId: string): Promise<void> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        '프로젝트 조회에 실패했습니다',
        500,
        'PROJECT_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        '프로젝트를 찾을 수 없습니다',
        404,
        'PROJECT_NOT_FOUND',
      );
    }
  }

  private async ensureImageExists(imageId: string): Promise<void> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('images')
      .select('id')
      .eq('id', imageId)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        '이미지 조회에 실패했습니다',
        500,
        'IMAGE_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        '이미지를 찾을 수 없습니다',
        404,
        'IMAGE_NOT_FOUND',
      );
    }
  }
}
