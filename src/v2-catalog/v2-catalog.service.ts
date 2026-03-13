import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';

type V2ProjectStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
type V2ArtistStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
type V2ProductKind = 'STANDARD' | 'BUNDLE';
type V2ProductStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
type V2FulfillmentType = 'DIGITAL' | 'PHYSICAL';
type V2VariantStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE';
type V2MediaType = 'IMAGE' | 'VIDEO';
type V2MediaRole = 'PRIMARY' | 'GALLERY' | 'DETAIL';
type V2MediaStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
type V2AssetRole = 'PRIMARY' | 'BONUS';
type V2DigitalAssetStatus = 'DRAFT' | 'READY' | 'RETIRED';

interface CreateV2ProjectInput {
  name?: string;
  slug?: string;
  description?: string | null;
  cover_image_url?: string | null;
  sort_order?: number;
  metadata?: Record<string, unknown>;
}

interface UpdateV2ProjectInput {
  name?: string;
  slug?: string;
  description?: string | null;
  cover_image_url?: string | null;
  sort_order?: number;
  metadata?: Record<string, unknown>;
  status?: V2ProjectStatus;
  is_active?: boolean;
}

interface CreateV2ArtistInput {
  name?: string;
  slug?: string;
  bio?: string | null;
  profile_image_url?: string | null;
  status?: V2ArtistStatus;
  metadata?: Record<string, unknown>;
}

interface UpdateV2ArtistInput {
  name?: string;
  slug?: string;
  bio?: string | null;
  profile_image_url?: string | null;
  status?: V2ArtistStatus;
  metadata?: Record<string, unknown>;
}

interface LinkArtistInput {
  role?: string;
  sort_order?: number;
  is_primary?: boolean;
  status?: V2ArtistStatus;
  metadata?: Record<string, unknown>;
}

interface CreateV2ProductInput {
  project_id?: string;
  product_kind?: V2ProductKind;
  title?: string;
  slug?: string;
  short_description?: string | null;
  description?: string | null;
  sort_order?: number;
  status?: V2ProductStatus;
  metadata?: Record<string, unknown>;
}

interface UpdateV2ProductInput {
  project_id?: string;
  product_kind?: V2ProductKind;
  title?: string;
  slug?: string;
  short_description?: string | null;
  description?: string | null;
  sort_order?: number;
  status?: V2ProductStatus;
  metadata?: Record<string, unknown>;
}

interface CreateV2VariantInput {
  sku?: string;
  title?: string;
  fulfillment_type?: V2FulfillmentType;
  requires_shipping?: boolean;
  track_inventory?: boolean;
  weight_grams?: number | null;
  dimension_json?: Record<string, unknown> | null;
  option_summary_json?: Record<string, unknown> | null;
  status?: V2VariantStatus;
  metadata?: Record<string, unknown>;
}

interface UpdateV2VariantInput {
  sku?: string;
  title?: string;
  fulfillment_type?: V2FulfillmentType;
  requires_shipping?: boolean;
  track_inventory?: boolean;
  weight_grams?: number | null;
  dimension_json?: Record<string, unknown> | null;
  option_summary_json?: Record<string, unknown> | null;
  status?: V2VariantStatus;
  metadata?: Record<string, unknown>;
}

interface CreateV2MediaInput {
  media_type?: V2MediaType;
  media_role?: V2MediaRole;
  storage_path?: string;
  public_url?: string | null;
  alt_text?: string | null;
  sort_order?: number;
  is_primary?: boolean;
  status?: V2MediaStatus;
  metadata?: Record<string, unknown>;
}

interface UpdateV2MediaInput {
  media_type?: V2MediaType;
  media_role?: V2MediaRole;
  storage_path?: string;
  public_url?: string | null;
  alt_text?: string | null;
  sort_order?: number;
  is_primary?: boolean;
  status?: V2MediaStatus;
  metadata?: Record<string, unknown>;
}

interface CreateV2DigitalAssetInput {
  asset_role?: V2AssetRole;
  file_name?: string;
  storage_path?: string;
  mime_type?: string;
  file_size?: number;
  version_no?: number;
  checksum?: string | null;
  status?: V2DigitalAssetStatus;
  metadata?: Record<string, unknown>;
}

interface UpdateV2DigitalAssetInput {
  file_name?: string;
  storage_path?: string;
  mime_type?: string;
  file_size?: number;
  checksum?: string | null;
  status?: V2DigitalAssetStatus;
  metadata?: Record<string, unknown>;
}

interface MigrationCheckResult {
  key: string;
  passed: boolean;
  expected: string;
  actual: string;
  detail: string;
}

interface ReadSwitchChecklistItem {
  key: string;
  passed: boolean;
  detail: string;
  action: string;
}

@Injectable()
export class V2CatalogService {
  private get supabase(): any {
    return getSupabaseClient() as any;
  }

  async getProjects(filters: { status?: V2ProjectStatus }): Promise<any[]> {
    let query = this.supabase
      .from('v2_projects')
      .select('*')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true });

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiException(
        'v2 프로젝트 목록 조회 실패',
        500,
        'V2_PROJECTS_FETCH_FAILED',
      );
    }

    return data || [];
  }

  async getProjectById(projectId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_projects')
      .select('*')
      .eq('id', projectId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'v2 프로젝트 조회 실패',
        500,
        'V2_PROJECT_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'v2 프로젝트를 찾을 수 없습니다',
        404,
        'V2_PROJECT_NOT_FOUND',
      );
    }

    return data;
  }

  async createProject(input: CreateV2ProjectInput): Promise<any> {
    const name = this.normalizeRequiredText(input.name, '프로젝트 이름은 필수입니다');
    const slug = this.normalizeRequiredText(input.slug, '프로젝트 slug는 필수입니다');

    await this.assertProjectSlugAvailable(slug);
    this.assertSortOrder(input.sort_order);

    const { data, error } = await this.supabase
      .from('v2_projects')
      .insert({
        name,
        slug,
        description: this.normalizeOptionalText(input.description),
        cover_image_url: this.normalizeOptionalText(input.cover_image_url),
        sort_order: input.sort_order ?? 0,
        status: 'DRAFT',
        is_active: false,
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'v2 프로젝트 생성 실패',
        500,
        'V2_PROJECT_CREATE_FAILED',
      );
    }

    return data;
  }

  async updateProject(projectId: string, input: UpdateV2ProjectInput): Promise<any> {
    const current = await this.getProjectById(projectId);
    const updateData: Record<string, unknown> = {};

    if (input.name !== undefined) {
      updateData.name = this.normalizeRequiredText(input.name, '프로젝트 이름은 필수입니다');
    }
    if (input.slug !== undefined) {
      const slug = this.normalizeRequiredText(input.slug, '프로젝트 slug는 필수입니다');
      await this.assertProjectSlugAvailable(slug, projectId);
      updateData.slug = slug;
    }
    if (input.description !== undefined) {
      updateData.description = this.normalizeOptionalText(input.description);
    }
    if (input.cover_image_url !== undefined) {
      updateData.cover_image_url = this.normalizeOptionalText(input.cover_image_url);
    }
    if (input.sort_order !== undefined) {
      this.assertSortOrder(input.sort_order);
      updateData.sort_order = input.sort_order;
    }
    if (input.metadata !== undefined) {
      updateData.metadata = input.metadata ?? {};
    }
    if (input.status !== undefined) {
      this.assertProjectStatus(input.status);
      this.assertProjectStatusTransition(current.status, input.status);
      updateData.status = input.status;
    }
    if (input.is_active !== undefined) {
      updateData.is_active = input.is_active;
    }

    if (Object.keys(updateData).length === 0) {
      return current;
    }

    const { data, error } = await this.supabase
      .from('v2_projects')
      .update(updateData)
      .eq('id', projectId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'v2 프로젝트 수정 실패',
        500,
        'V2_PROJECT_UPDATE_FAILED',
      );
    }

    return data;
  }

  async publishProject(projectId: string): Promise<any> {
    await this.getProjectById(projectId);
    const { data, error } = await this.supabase
      .from('v2_projects')
      .update({
        status: 'ACTIVE',
        is_active: true,
      })
      .eq('id', projectId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'v2 프로젝트 publish 실패',
        500,
        'V2_PROJECT_PUBLISH_FAILED',
      );
    }

    return data;
  }

  async unpublishProject(projectId: string): Promise<any> {
    await this.getProjectById(projectId);
    const { data, error } = await this.supabase
      .from('v2_projects')
      .update({
        status: 'DRAFT',
        is_active: false,
      })
      .eq('id', projectId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'v2 프로젝트 unpublish 실패',
        500,
        'V2_PROJECT_UNPUBLISH_FAILED',
      );
    }

    return data;
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.getProjectById(projectId);
    const { error } = await this.supabase
      .from('v2_projects')
      .update({
        status: 'ARCHIVED',
        is_active: false,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', projectId);

    if (error) {
      throw new ApiException(
        'v2 프로젝트 삭제 실패',
        500,
        'V2_PROJECT_DELETE_FAILED',
      );
    }
  }

  async getArtists(filters: { projectId?: string }): Promise<any[]> {
    if (filters.projectId) {
      await this.ensureProjectExists(filters.projectId);
      const { data, error } = await this.supabase
        .from('v2_project_artists')
        .select(
          `
          id,
          project_id,
          artist_id,
          role,
          sort_order,
          is_primary,
          status,
          metadata,
          created_at,
          updated_at,
          artist:v2_artists(*)
        `,
        )
        .eq('project_id', filters.projectId)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true });

      if (error) {
        throw new ApiException(
          'v2 프로젝트 아티스트 조회 실패',
          500,
          'V2_PROJECT_ARTISTS_FETCH_FAILED',
        );
      }

      return data || [];
    }

    const { data, error } = await this.supabase
      .from('v2_artists')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw new ApiException(
        'v2 아티스트 목록 조회 실패',
        500,
        'V2_ARTISTS_FETCH_FAILED',
      );
    }

    return data || [];
  }

  async getArtistById(artistId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_artists')
      .select('*')
      .eq('id', artistId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'v2 아티스트 조회 실패',
        500,
        'V2_ARTIST_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'v2 아티스트를 찾을 수 없습니다',
        404,
        'V2_ARTIST_NOT_FOUND',
      );
    }

    return data;
  }

  async createArtist(input: CreateV2ArtistInput): Promise<any> {
    const name = this.normalizeRequiredText(input.name, '아티스트 이름은 필수입니다');
    const slug = this.normalizeRequiredText(input.slug, '아티스트 slug는 필수입니다');

    await this.assertArtistSlugAvailable(slug);
    if (input.status !== undefined) {
      this.assertArtistStatus(input.status);
    }

    const { data, error } = await this.supabase
      .from('v2_artists')
      .insert({
        name,
        slug,
        bio: this.normalizeOptionalText(input.bio),
        profile_image_url: this.normalizeOptionalText(input.profile_image_url),
        status: input.status ?? 'DRAFT',
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'v2 아티스트 생성 실패',
        500,
        'V2_ARTIST_CREATE_FAILED',
      );
    }

    return data;
  }

  async updateArtist(artistId: string, input: UpdateV2ArtistInput): Promise<any> {
    const current = await this.getArtistById(artistId);
    const updateData: Record<string, unknown> = {};

    if (input.name !== undefined) {
      updateData.name = this.normalizeRequiredText(input.name, '아티스트 이름은 필수입니다');
    }
    if (input.slug !== undefined) {
      const slug = this.normalizeRequiredText(input.slug, '아티스트 slug는 필수입니다');
      await this.assertArtistSlugAvailable(slug, artistId);
      updateData.slug = slug;
    }
    if (input.bio !== undefined) {
      updateData.bio = this.normalizeOptionalText(input.bio);
    }
    if (input.profile_image_url !== undefined) {
      updateData.profile_image_url = this.normalizeOptionalText(
        input.profile_image_url,
      );
    }
    if (input.status !== undefined) {
      this.assertArtistStatus(input.status);
      updateData.status = input.status;
    }
    if (input.metadata !== undefined) {
      updateData.metadata = input.metadata ?? {};
    }

    if (Object.keys(updateData).length === 0) {
      return current;
    }

    const { data, error } = await this.supabase
      .from('v2_artists')
      .update(updateData)
      .eq('id', artistId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'v2 아티스트 수정 실패',
        500,
        'V2_ARTIST_UPDATE_FAILED',
      );
    }

    return data;
  }

  async linkArtistToProject(
    projectId: string,
    artistId: string,
    input: LinkArtistInput,
  ): Promise<any> {
    await this.ensureProjectExists(projectId);
    await this.ensureArtistExists(artistId);

    const sortOrder = input.sort_order ?? 0;
    this.assertSortOrder(sortOrder);

    const status = input.status ?? 'ACTIVE';
    this.assertArtistStatus(status);

    if (input.is_primary) {
      const { error: resetError } = await this.supabase
        .from('v2_project_artists')
        .update({ is_primary: false })
        .eq('project_id', projectId)
        .is('deleted_at', null);

      if (resetError) {
        throw new ApiException(
          '기존 primary 아티스트 해제 실패',
          500,
          'V2_PROJECT_ARTIST_UPDATE_FAILED',
        );
      }
    }

    const { data, error } = await this.supabase
      .from('v2_project_artists')
      .upsert(
        {
          project_id: projectId,
          artist_id: artistId,
          role: this.normalizeRequiredText(input.role ?? 'ARTIST', 'role은 필수입니다'),
          sort_order: sortOrder,
          is_primary: input.is_primary ?? false,
          status,
          metadata: input.metadata ?? {},
          deleted_at: null,
        },
        {
          onConflict: 'project_id,artist_id',
        },
      )
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'v2 프로젝트-아티스트 연결 실패',
        500,
        'V2_PROJECT_ARTIST_LINK_FAILED',
      );
    }

    return data;
  }

  async unlinkArtistFromProject(projectId: string, artistId: string): Promise<void> {
    const { data: relation, error: relationError } = await this.supabase
      .from('v2_project_artists')
      .select('id')
      .eq('project_id', projectId)
      .eq('artist_id', artistId)
      .is('deleted_at', null)
      .maybeSingle();

    if (relationError) {
      throw new ApiException(
        'v2 프로젝트-아티스트 연결 조회 실패',
        500,
        'V2_PROJECT_ARTIST_FETCH_FAILED',
      );
    }
    if (!relation) {
      throw new ApiException(
        '연결된 프로젝트 아티스트를 찾을 수 없습니다',
        404,
        'V2_PROJECT_ARTIST_NOT_FOUND',
      );
    }

    const { error } = await this.supabase
      .from('v2_project_artists')
      .update({
        is_primary: false,
        status: 'ARCHIVED',
        deleted_at: new Date().toISOString(),
      })
      .eq('id', relation.id);

    if (error) {
      throw new ApiException(
        'v2 프로젝트-아티스트 연결 해제 실패',
        500,
        'V2_PROJECT_ARTIST_UNLINK_FAILED',
      );
    }
  }

  async getProducts(filters: {
    projectId?: string;
    status?: V2ProductStatus;
  }): Promise<any[]> {
    let query = this.supabase
      .from('v2_products')
      .select('*')
      .is('deleted_at', null)
      .order('sort_order', { ascending: true });

    if (filters.projectId) {
      query = query.eq('project_id', filters.projectId);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiException(
        'v2 상품 목록 조회 실패',
        500,
        'V2_PRODUCTS_FETCH_FAILED',
      );
    }

    return data || [];
  }

  async getProductById(productId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_products')
      .select('*')
      .eq('id', productId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'v2 상품 조회 실패',
        500,
        'V2_PRODUCT_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'v2 상품을 찾을 수 없습니다',
        404,
        'V2_PRODUCT_NOT_FOUND',
      );
    }

    return data;
  }

  async createProduct(input: CreateV2ProductInput): Promise<any> {
    const projectId = this.normalizeRequiredText(
      input.project_id,
      'project_id는 필수입니다',
    );
    const title = this.normalizeRequiredText(input.title, '상품명은 필수입니다');
    const slug = this.normalizeRequiredText(input.slug, '상품 slug는 필수입니다');
    const productKind = input.product_kind ?? 'STANDARD';
    this.assertProductKind(productKind);
    this.assertSortOrder(input.sort_order);
    if (input.status !== undefined) {
      this.assertProductStatus(input.status);
    }

    await this.ensureProjectExists(projectId);
    await this.assertProductSlugAvailable(projectId, slug);

    const { data, error } = await this.supabase
      .from('v2_products')
      .insert({
        project_id: projectId,
        product_kind: productKind,
        title,
        slug,
        short_description: this.normalizeOptionalText(input.short_description),
        description: this.normalizeOptionalText(input.description),
        sort_order: input.sort_order ?? 0,
        status: input.status ?? 'DRAFT',
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'v2 상품 생성 실패',
        500,
        'V2_PRODUCT_CREATE_FAILED',
      );
    }

    return data;
  }

  async updateProduct(productId: string, input: UpdateV2ProductInput): Promise<any> {
    const current = await this.getProductById(productId);
    const updateData: Record<string, unknown> = {};

    let projectIdForSlug = current.project_id as string;
    if (input.project_id !== undefined) {
      const projectId = this.normalizeRequiredText(
        input.project_id,
        'project_id는 필수입니다',
      );
      await this.ensureProjectExists(projectId);
      updateData.project_id = projectId;
      projectIdForSlug = projectId;
    }

    if (input.title !== undefined) {
      updateData.title = this.normalizeRequiredText(input.title, '상품명은 필수입니다');
    }
    if (input.slug !== undefined) {
      const slug = this.normalizeRequiredText(input.slug, '상품 slug는 필수입니다');
      await this.assertProductSlugAvailable(projectIdForSlug, slug, productId);
      updateData.slug = slug;
    }
    if (input.product_kind !== undefined) {
      this.assertProductKind(input.product_kind);
      updateData.product_kind = input.product_kind;
    }
    if (input.short_description !== undefined) {
      updateData.short_description = this.normalizeOptionalText(
        input.short_description,
      );
    }
    if (input.description !== undefined) {
      updateData.description = this.normalizeOptionalText(input.description);
    }
    if (input.sort_order !== undefined) {
      this.assertSortOrder(input.sort_order);
      updateData.sort_order = input.sort_order;
    }
    if (input.status !== undefined) {
      this.assertProductStatus(input.status);
      this.assertProductStatusTransition(current.status, input.status);
      updateData.status = input.status;
    }
    if (input.metadata !== undefined) {
      updateData.metadata = input.metadata ?? {};
    }

    if (Object.keys(updateData).length === 0) {
      return current;
    }

    const { data, error } = await this.supabase
      .from('v2_products')
      .update(updateData)
      .eq('id', productId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'v2 상품 수정 실패',
        500,
        'V2_PRODUCT_UPDATE_FAILED',
      );
    }

    return data;
  }

  async deleteProduct(productId: string): Promise<void> {
    await this.getProductById(productId);
    const { error } = await this.supabase
      .from('v2_products')
      .update({
        status: 'ARCHIVED',
        deleted_at: new Date().toISOString(),
      })
      .eq('id', productId);

    if (error) {
      throw new ApiException(
        'v2 상품 삭제 실패',
        500,
        'V2_PRODUCT_DELETE_FAILED',
      );
    }
  }

  async getVariants(productId: string): Promise<any[]> {
    await this.ensureProductExists(productId);
    const { data, error } = await this.supabase
      .from('v2_product_variants')
      .select('*')
      .eq('product_id', productId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) {
      throw new ApiException(
        'v2 variant 목록 조회 실패',
        500,
        'V2_VARIANTS_FETCH_FAILED',
      );
    }

    return data || [];
  }

  async createVariant(productId: string, input: CreateV2VariantInput): Promise<any> {
    await this.ensureProductExists(productId);

    const sku = this.normalizeRequiredText(input.sku, 'sku는 필수입니다');
    const title = this.normalizeRequiredText(input.title, 'variant title은 필수입니다');
    const fulfillmentType = input.fulfillment_type;
    if (!fulfillmentType) {
      throw new ApiException(
        'fulfillment_type은 필수입니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    this.assertFulfillmentType(fulfillmentType);
    this.assertVariantStatus(input.status ?? 'DRAFT');
    this.assertWeight(input.weight_grams);

    await this.assertSkuAvailable(sku);

    const requiresShipping =
      input.requires_shipping ?? fulfillmentType === 'PHYSICAL';
    if (fulfillmentType === 'DIGITAL' && requiresShipping) {
      throw new ApiException(
        'DIGITAL variant는 requires_shipping=true를 가질 수 없습니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    const { data, error } = await this.supabase
      .from('v2_product_variants')
      .insert({
        product_id: productId,
        sku,
        title,
        fulfillment_type: fulfillmentType,
        requires_shipping: requiresShipping,
        track_inventory: input.track_inventory ?? false,
        weight_grams: input.weight_grams ?? null,
        dimension_json: input.dimension_json ?? null,
        option_summary_json: input.option_summary_json ?? null,
        status: input.status ?? 'DRAFT',
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'v2 variant 생성 실패',
        500,
        'V2_VARIANT_CREATE_FAILED',
      );
    }

    return data;
  }

  async updateVariant(variantId: string, input: UpdateV2VariantInput): Promise<any> {
    const current = await this.getVariantById(variantId);
    const updateData: Record<string, unknown> = {};

    let nextFulfillmentType = current.fulfillment_type as V2FulfillmentType;
    if (input.fulfillment_type !== undefined) {
      this.assertFulfillmentType(input.fulfillment_type);
      updateData.fulfillment_type = input.fulfillment_type;
      nextFulfillmentType = input.fulfillment_type;
    }
    if (input.sku !== undefined) {
      const sku = this.normalizeRequiredText(input.sku, 'sku는 필수입니다');
      await this.assertSkuAvailable(sku, variantId);
      updateData.sku = sku;
    }
    if (input.title !== undefined) {
      updateData.title = this.normalizeRequiredText(
        input.title,
        'variant title은 필수입니다',
      );
    }
    if (input.weight_grams !== undefined) {
      this.assertWeight(input.weight_grams);
      updateData.weight_grams = input.weight_grams ?? null;
    }
    if (input.dimension_json !== undefined) {
      updateData.dimension_json = input.dimension_json ?? null;
    }
    if (input.option_summary_json !== undefined) {
      updateData.option_summary_json = input.option_summary_json ?? null;
    }
    if (input.track_inventory !== undefined) {
      updateData.track_inventory = input.track_inventory;
    }
    if (input.requires_shipping !== undefined) {
      updateData.requires_shipping = input.requires_shipping;
    }
    if (input.status !== undefined) {
      this.assertVariantStatus(input.status);
      this.assertVariantStatusTransition(current.status, input.status);
      updateData.status = input.status;
    }
    if (input.metadata !== undefined) {
      updateData.metadata = input.metadata ?? {};
    }

    const nextRequiresShipping =
      (updateData.requires_shipping as boolean | undefined) ??
      (current.requires_shipping as boolean);
    if (nextFulfillmentType === 'DIGITAL' && nextRequiresShipping) {
      throw new ApiException(
        'DIGITAL variant는 requires_shipping=true를 가질 수 없습니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    if (Object.keys(updateData).length === 0) {
      return current;
    }

    const { data, error } = await this.supabase
      .from('v2_product_variants')
      .update(updateData)
      .eq('id', variantId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'v2 variant 수정 실패',
        500,
        'V2_VARIANT_UPDATE_FAILED',
      );
    }

    return data;
  }

  async deleteVariant(variantId: string): Promise<void> {
    await this.getVariantById(variantId);
    const { error } = await this.supabase
      .from('v2_product_variants')
      .update({
        status: 'INACTIVE',
        deleted_at: new Date().toISOString(),
      })
      .eq('id', variantId);

    if (error) {
      throw new ApiException(
        'v2 variant 삭제 실패',
        500,
        'V2_VARIANT_DELETE_FAILED',
      );
    }
  }

  async getProductMedia(productId: string): Promise<any[]> {
    await this.ensureProductExists(productId);
    const { data, error } = await this.supabase
      .from('v2_product_media')
      .select('*')
      .eq('product_id', productId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true });

    if (error) {
      throw new ApiException(
        'v2 상품 media 조회 실패',
        500,
        'V2_PRODUCT_MEDIA_FETCH_FAILED',
      );
    }

    return data || [];
  }

  async createProductMedia(productId: string, input: CreateV2MediaInput): Promise<any> {
    await this.ensureProductExists(productId);
    const storagePath = this.normalizeRequiredText(
      input.storage_path,
      'storage_path는 필수입니다',
    );
    const mediaType = input.media_type ?? 'IMAGE';
    const mediaRole = input.media_role ?? 'GALLERY';
    this.assertMediaType(mediaType);
    this.assertMediaRole(mediaRole);
    this.assertMediaStatus(input.status ?? 'DRAFT');
    this.assertSortOrder(input.sort_order);

    const isPrimary = input.is_primary ?? mediaRole === 'PRIMARY';
    if (isPrimary) {
      await this.clearPrimaryMedia(productId);
    }

    const { data, error } = await this.supabase
      .from('v2_product_media')
      .insert({
        product_id: productId,
        media_type: mediaType,
        media_role: mediaRole,
        storage_path: storagePath,
        public_url: this.normalizeOptionalText(input.public_url),
        alt_text: this.normalizeOptionalText(input.alt_text),
        sort_order: input.sort_order ?? 0,
        is_primary: isPrimary,
        status: input.status ?? 'DRAFT',
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'v2 상품 media 생성 실패',
        500,
        'V2_PRODUCT_MEDIA_CREATE_FAILED',
      );
    }

    return data;
  }

  async updateProductMedia(mediaId: string, input: UpdateV2MediaInput): Promise<any> {
    const current = await this.getMediaById(mediaId);
    const updateData: Record<string, unknown> = {};

    if (input.media_type !== undefined) {
      this.assertMediaType(input.media_type);
      updateData.media_type = input.media_type;
    }
    if (input.media_role !== undefined) {
      this.assertMediaRole(input.media_role);
      updateData.media_role = input.media_role;
    }
    if (input.storage_path !== undefined) {
      updateData.storage_path = this.normalizeRequiredText(
        input.storage_path,
        'storage_path는 필수입니다',
      );
    }
    if (input.public_url !== undefined) {
      updateData.public_url = this.normalizeOptionalText(input.public_url);
    }
    if (input.alt_text !== undefined) {
      updateData.alt_text = this.normalizeOptionalText(input.alt_text);
    }
    if (input.sort_order !== undefined) {
      this.assertSortOrder(input.sort_order);
      updateData.sort_order = input.sort_order;
    }
    if (input.status !== undefined) {
      this.assertMediaStatus(input.status);
      updateData.status = input.status;
    }
    if (input.metadata !== undefined) {
      updateData.metadata = input.metadata ?? {};
    }
    if (input.is_primary !== undefined) {
      updateData.is_primary = input.is_primary;
      if (input.is_primary) {
        await this.clearPrimaryMedia(current.product_id as string, mediaId);
      }
    }

    if (Object.keys(updateData).length === 0) {
      return current;
    }

    const { data, error } = await this.supabase
      .from('v2_product_media')
      .update(updateData)
      .eq('id', mediaId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'v2 상품 media 수정 실패',
        500,
        'V2_PRODUCT_MEDIA_UPDATE_FAILED',
      );
    }

    return data;
  }

  async deactivateProductMedia(mediaId: string): Promise<any> {
    await this.getMediaById(mediaId);
    const { data, error } = await this.supabase
      .from('v2_product_media')
      .update({
        status: 'INACTIVE',
        is_primary: false,
      })
      .eq('id', mediaId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'v2 상품 media 비활성화 실패',
        500,
        'V2_PRODUCT_MEDIA_DEACTIVATE_FAILED',
      );
    }

    return data;
  }

  async getVariantAssets(variantId: string): Promise<any[]> {
    await this.ensureVariantExists(variantId);
    const { data, error } = await this.supabase
      .from('v2_digital_assets')
      .select('*')
      .eq('variant_id', variantId)
      .is('deleted_at', null)
      .order('version_no', { ascending: false });

    if (error) {
      throw new ApiException(
        'v2 digital asset 조회 실패',
        500,
        'V2_DIGITAL_ASSETS_FETCH_FAILED',
      );
    }

    return data || [];
  }

  async createDigitalAsset(
    variantId: string,
    input: CreateV2DigitalAssetInput,
  ): Promise<any> {
    const variant = await this.getVariantById(variantId);
    if (variant.fulfillment_type !== 'DIGITAL') {
      throw new ApiException(
        'DIGITAL variant에만 digital asset을 등록할 수 있습니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    const assetRole = input.asset_role ?? 'PRIMARY';
    this.assertAssetRole(assetRole);
    const status = input.status ?? 'DRAFT';
    this.assertDigitalAssetStatus(status);

    const versionNo =
      input.version_no ?? (await this.getNextDigitalAssetVersion(variantId, assetRole));
    this.assertPositiveInteger(versionNo, 'version_no');

    const fileName = this.normalizeRequiredText(
      input.file_name,
      'file_name은 필수입니다',
    );
    const storagePath = this.normalizeRequiredText(
      input.storage_path,
      'storage_path는 필수입니다',
    );
    const mimeType = this.normalizeRequiredText(
      input.mime_type,
      'mime_type은 필수입니다',
    );
    this.assertPositiveInteger(input.file_size, 'file_size');

    const { data, error } = await this.supabase
      .from('v2_digital_assets')
      .insert({
        variant_id: variantId,
        asset_role: assetRole,
        file_name: fileName,
        storage_path: storagePath,
        mime_type: mimeType,
        file_size: input.file_size,
        version_no: versionNo,
        checksum: this.normalizeOptionalText(input.checksum),
        status,
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'v2 digital asset 생성 실패',
        500,
        'V2_DIGITAL_ASSET_CREATE_FAILED',
      );
    }

    return data;
  }

  async updateDigitalAsset(
    assetId: string,
    input: UpdateV2DigitalAssetInput,
  ): Promise<any> {
    const current = await this.getDigitalAssetById(assetId);
    const updateData: Record<string, unknown> = {};

    if (input.file_name !== undefined) {
      updateData.file_name = this.normalizeRequiredText(
        input.file_name,
        'file_name은 필수입니다',
      );
    }
    if (input.storage_path !== undefined) {
      updateData.storage_path = this.normalizeRequiredText(
        input.storage_path,
        'storage_path는 필수입니다',
      );
    }
    if (input.mime_type !== undefined) {
      updateData.mime_type = this.normalizeRequiredText(
        input.mime_type,
        'mime_type은 필수입니다',
      );
    }
    if (input.file_size !== undefined) {
      this.assertPositiveInteger(input.file_size, 'file_size');
      updateData.file_size = input.file_size;
    }
    if (input.checksum !== undefined) {
      updateData.checksum = this.normalizeOptionalText(input.checksum);
    }
    if (input.status !== undefined) {
      this.assertDigitalAssetStatus(input.status);
      this.assertDigitalAssetStatusTransition(current.status, input.status);
      updateData.status = input.status;
    }
    if (input.metadata !== undefined) {
      updateData.metadata = input.metadata ?? {};
    }

    if (Object.keys(updateData).length === 0) {
      return current;
    }

    const { data, error } = await this.supabase
      .from('v2_digital_assets')
      .update(updateData)
      .eq('id', assetId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'v2 digital asset 수정 실패',
        500,
        'V2_DIGITAL_ASSET_UPDATE_FAILED',
      );
    }

    return data;
  }

  async activateDigitalAsset(assetId: string): Promise<any> {
    await this.getDigitalAssetById(assetId);
    const { data, error } = await this.supabase
      .from('v2_digital_assets')
      .update({ status: 'READY' })
      .eq('id', assetId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'v2 digital asset 활성화 실패',
        500,
        'V2_DIGITAL_ASSET_ACTIVATE_FAILED',
      );
    }

    return data;
  }

  async deactivateDigitalAsset(assetId: string): Promise<any> {
    await this.getDigitalAssetById(assetId);
    const { data, error } = await this.supabase
      .from('v2_digital_assets')
      .update({ status: 'RETIRED' })
      .eq('id', assetId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'v2 digital asset 비활성화 실패',
        500,
        'V2_DIGITAL_ASSET_DEACTIVATE_FAILED',
      );
    }

    return data;
  }

  async getProductPublishReadiness(productId: string): Promise<any> {
    const product = await this.getProductById(productId);
    const project = await this.getProjectById(product.project_id);
    const variants = await this.getVariants(productId);

    const { data: primaryMedia, error: primaryMediaError } = await this.supabase
      .from('v2_product_media')
      .select('id')
      .eq('product_id', productId)
      .eq('is_primary', true)
      .eq('status', 'ACTIVE')
      .is('deleted_at', null);

    if (primaryMediaError) {
      throw new ApiException(
        'v2 media readiness 조회 실패',
        500,
        'V2_PRODUCT_MEDIA_FETCH_FAILED',
      );
    }

    const activeVariants = variants.filter((variant) => variant.status === 'ACTIVE');
    const activeDigitalVariants = activeVariants.filter(
      (variant) => variant.fulfillment_type === 'DIGITAL',
    );

    let readyAssetVariantIds = new Set<string>();
    if (activeDigitalVariants.length > 0) {
      const digitalVariantIds = activeDigitalVariants.map((variant) => variant.id);
      const { data: readyAssets, error: readyAssetsError } = await this.supabase
        .from('v2_digital_assets')
        .select('variant_id')
        .in('variant_id', digitalVariantIds)
        .eq('status', 'READY')
        .is('deleted_at', null);

      if (readyAssetsError) {
        throw new ApiException(
          'v2 digital asset readiness 조회 실패',
          500,
          'V2_DIGITAL_ASSETS_FETCH_FAILED',
        );
      }

      readyAssetVariantIds = new Set(
        (readyAssets || []).map((asset: { variant_id: string }) => asset.variant_id),
      );
    }

    const missingDigitalAssetVariantIds = activeDigitalVariants
      .filter((variant) => !readyAssetVariantIds.has(variant.id))
      .map((variant) => variant.id);

    const checks = [
      {
        key: 'project_active',
        passed: project.status === 'ACTIVE',
        detail: `project.status=${project.status}`,
      },
      {
        key: 'product_active',
        passed: product.status === 'ACTIVE',
        detail: `product.status=${product.status}`,
      },
      {
        key: 'active_variant_exists',
        passed: activeVariants.length > 0,
        detail: `active_variant_count=${activeVariants.length}`,
      },
      {
        key: 'primary_media_ready',
        passed: (primaryMedia || []).length > 0,
        detail: `active_primary_media_count=${(primaryMedia || []).length}`,
      },
      {
        key: 'digital_assets_ready',
        passed: missingDigitalAssetVariantIds.length === 0,
        detail:
          missingDigitalAssetVariantIds.length === 0
            ? 'all active digital variants have READY assets'
            : `missing_ready_asset_variant_ids=${missingDigitalAssetVariantIds.join(',')}`,
      },
    ];

    return {
      product_id: productId,
      ready: checks.every((check) => check.passed),
      checks,
    };
  }

  async getMigrationCompareReport(sampleLimit = 20): Promise<any> {
    const safeSampleLimit = this.normalizeMigrationSampleLimit(sampleLimit);

    const [
      legacyProjects,
      legacyArtists,
      legacyProducts,
      v2Projects,
      v2Artists,
      v2ProjectArtists,
      v2Products,
      v2Variants,
      v2ProductMedia,
      v2DigitalAssets,
    ] = await Promise.all([
      this.fetchLegacyRows(
        'projects',
        'id,name,slug,is_active',
        '프로젝트 비교 데이터 조회 실패',
        'V2_MIGRATION_COMPARE_FAILED',
      ),
      this.fetchLegacyRows(
        'artists',
        'id,project_id,name,slug,is_active',
        '아티스트 비교 데이터 조회 실패',
        'V2_MIGRATION_COMPARE_FAILED',
      ),
      this.fetchLegacyRows(
        'products',
        'id,project_id,name,slug,type,is_active,digital_file_url',
        '상품 비교 데이터 조회 실패',
        'V2_MIGRATION_COMPARE_FAILED',
      ),
      this.fetchV2Rows(
        'v2_projects',
        'id,legacy_project_id,name,slug,status,is_active',
        'v2 프로젝트 비교 데이터 조회 실패',
        'V2_MIGRATION_COMPARE_FAILED',
      ),
      this.fetchV2Rows(
        'v2_artists',
        'id,legacy_artist_id,name,slug,status',
        'v2 아티스트 비교 데이터 조회 실패',
        'V2_MIGRATION_COMPARE_FAILED',
      ),
      this.fetchV2Rows(
        'v2_project_artists',
        'id,project_id,artist_id,status,is_primary',
        'v2 프로젝트-아티스트 비교 데이터 조회 실패',
        'V2_MIGRATION_COMPARE_FAILED',
      ),
      this.fetchV2Rows(
        'v2_products',
        'id,legacy_product_id,project_id,title,slug,status,metadata',
        'v2 상품 비교 데이터 조회 실패',
        'V2_MIGRATION_COMPARE_FAILED',
      ),
      this.fetchV2Rows(
        'v2_product_variants',
        'id,product_id,fulfillment_type,status',
        'v2 variant 비교 데이터 조회 실패',
        'V2_MIGRATION_COMPARE_FAILED',
      ),
      this.fetchV2Rows(
        'v2_product_media',
        'id,product_id,is_primary,status',
        'v2 media 비교 데이터 조회 실패',
        'V2_MIGRATION_COMPARE_FAILED',
      ),
      this.fetchV2Rows(
        'v2_digital_assets',
        'id,variant_id,status',
        'v2 digital asset 비교 데이터 조회 실패',
        'V2_MIGRATION_COMPARE_FAILED',
      ),
    ]);

    const backfilledProjects = v2Projects.filter(
      (project) => project.legacy_project_id !== null,
    );
    const backfilledArtists = v2Artists.filter(
      (artist) => artist.legacy_artist_id !== null,
    );
    const backfilledProducts = v2Products.filter(
      (product) => product.legacy_product_id !== null,
    );

    const legacyProjectsById = new Map(
      legacyProjects.map((project) => [project.id, project]),
    );
    const legacyArtistsById = new Map(
      legacyArtists.map((artist) => [artist.id, artist]),
    );
    const legacyProductsById = new Map(
      legacyProducts.map((product) => [product.id, product]),
    );

    const v2ProjectsById = new Map(v2Projects.map((project) => [project.id, project]));
    const v2ArtistsById = new Map(v2Artists.map((artist) => [artist.id, artist]));
    const v2ProjectsByLegacyId = new Map(
      backfilledProjects.map((project) => [project.legacy_project_id, project]),
    );
    const v2ArtistsByLegacyId = new Map(
      backfilledArtists.map((artist) => [artist.legacy_artist_id, artist]),
    );
    const v2ProductsByLegacyId = new Map(
      backfilledProducts.map((product) => [product.legacy_product_id, product]),
    );

    const missingProjectMappings = legacyProjects.filter(
      (project) => !v2ProjectsByLegacyId.has(project.id),
    );
    const missingArtistMappings = legacyArtists.filter(
      (artist) => !v2ArtistsByLegacyId.has(artist.id),
    );
    const missingProductMappings = legacyProducts.filter(
      (product) => !v2ProductsByLegacyId.has(product.id),
    );

    const orphanProjectMappings = backfilledProjects.filter(
      (project) => !legacyProjectsById.has(project.legacy_project_id),
    );
    const orphanArtistMappings = backfilledArtists.filter(
      (artist) => !legacyArtistsById.has(artist.legacy_artist_id),
    );
    const orphanProductMappings = backfilledProducts.filter(
      (product) => !legacyProductsById.has(product.legacy_product_id),
    );

    const projectSlugMismatch = backfilledProjects
      .map((v2Project) => {
        const legacyProject = legacyProjectsById.get(v2Project.legacy_project_id);
        if (!legacyProject || legacyProject.slug === v2Project.slug) {
          return null;
        }
        return {
          legacy_project_id: legacyProject.id,
          legacy_slug: legacyProject.slug,
          v2_project_id: v2Project.id,
          v2_slug: v2Project.slug,
        };
      })
      .filter((item) => item !== null);

    const artistSlugMismatch = backfilledArtists
      .map((v2Artist) => {
        const legacyArtist = legacyArtistsById.get(v2Artist.legacy_artist_id);
        if (!legacyArtist || legacyArtist.slug === v2Artist.slug) {
          return null;
        }
        return {
          legacy_artist_id: legacyArtist.id,
          legacy_slug: legacyArtist.slug,
          v2_artist_id: v2Artist.id,
          v2_slug: v2Artist.slug,
        };
      })
      .filter((item) => item !== null);

    const productSlugMismatch = backfilledProducts
      .map((v2Product) => {
        const legacyProduct = legacyProductsById.get(v2Product.legacy_product_id);
        if (!legacyProduct) {
          return null;
        }
        const slugRank = this.extractSlugRank(v2Product.metadata);
        const shouldCheckSlug = slugRank === null || slugRank <= 1;
        if (!shouldCheckSlug || legacyProduct.slug === v2Product.slug) {
          return null;
        }
        return {
          legacy_product_id: legacyProduct.id,
          legacy_slug: legacyProduct.slug,
          v2_product_id: v2Product.id,
          v2_slug: v2Product.slug,
          slug_rank: slugRank,
        };
      })
      .filter((item) => item !== null);

    const productProjectMappingMismatch = backfilledProducts
      .map((v2Product) => {
        const legacyProduct = legacyProductsById.get(v2Product.legacy_product_id);
        const mappedV2Project = v2ProjectsById.get(v2Product.project_id);
        if (!legacyProduct || !mappedV2Project || !mappedV2Project.legacy_project_id) {
          return null;
        }
        if (legacyProduct.project_id === mappedV2Project.legacy_project_id) {
          return null;
        }
        return {
          legacy_product_id: legacyProduct.id,
          legacy_project_id: legacyProduct.project_id,
          v2_product_id: v2Product.id,
          v2_project_id: mappedV2Project.id,
          v2_project_legacy_project_id: mappedV2Project.legacy_project_id,
        };
      })
      .filter((item) => item !== null);

    const projectArtistLegacyPairs = new Set(
      v2ProjectArtists
        .map((relation) => {
          const v2Project = v2ProjectsById.get(relation.project_id);
          const v2Artist = v2ArtistsById.get(relation.artist_id);
          if (
            !v2Project ||
            !v2Artist ||
            !v2Project.legacy_project_id ||
            !v2Artist.legacy_artist_id
          ) {
            return null;
          }
          return `${v2Project.legacy_project_id}:${v2Artist.legacy_artist_id}`;
        })
        .filter((value) => value !== null),
    );

    const missingProjectArtistLinks = legacyArtists.filter(
      (artist) => !projectArtistLegacyPairs.has(`${artist.project_id}:${artist.id}`),
    );

    const variantsByProductId = new Map<string, any[]>();
    for (const variant of v2Variants) {
      const current = variantsByProductId.get(variant.product_id) || [];
      current.push(variant);
      variantsByProductId.set(variant.product_id, current);
    }

    const productsWithoutVariants = v2Products.filter(
      (product) => !variantsByProductId.has(product.id),
    );

    const digitalVariants = v2Variants.filter(
      (variant) => variant.fulfillment_type === 'DIGITAL',
    );
    const activeDigitalVariants = digitalVariants.filter(
      (variant) => variant.status === 'ACTIVE',
    );
    const activeProducts = v2Products.filter((product) => product.status === 'ACTIVE');

    const primaryMediaProductIds = new Set(
      v2ProductMedia
        .filter((media) => media.is_primary && media.status === 'ACTIVE')
        .map((media) => media.product_id),
    );
    const activeProductsWithoutPrimaryMedia = activeProducts.filter(
      (product) => !primaryMediaProductIds.has(product.id),
    );

    const variantsWithAnyAsset = new Set(
      v2DigitalAssets.map((asset) => asset.variant_id),
    );
    const variantsWithReadyAsset = new Set(
      v2DigitalAssets
        .filter((asset) => asset.status === 'READY')
        .map((asset) => asset.variant_id),
    );

    const digitalVariantsWithoutAssets = digitalVariants.filter(
      (variant) => !variantsWithAnyAsset.has(variant.id),
    );
    const activeDigitalVariantsWithoutReadyAsset = activeDigitalVariants.filter(
      (variant) => !variantsWithReadyAsset.has(variant.id),
    );

    const checks: MigrationCheckResult[] = [
      {
        key: 'projects_backfill_complete',
        passed: missingProjectMappings.length === 0,
        expected: 'missing_project_mappings=0',
        actual: `missing_project_mappings=${missingProjectMappings.length}`,
        detail: 'legacy projects가 모두 v2_projects로 매핑되어야 함',
      },
      {
        key: 'artists_backfill_complete',
        passed: missingArtistMappings.length === 0,
        expected: 'missing_artist_mappings=0',
        actual: `missing_artist_mappings=${missingArtistMappings.length}`,
        detail: 'legacy artists가 모두 v2_artists로 매핑되어야 함',
      },
      {
        key: 'products_backfill_complete',
        passed: missingProductMappings.length === 0,
        expected: 'missing_product_mappings=0',
        actual: `missing_product_mappings=${missingProductMappings.length}`,
        detail: 'legacy products가 모두 v2_products로 매핑되어야 함',
      },
      {
        key: 'project_artist_links_complete',
        passed: missingProjectArtistLinks.length === 0,
        expected: 'missing_project_artist_links=0',
        actual: `missing_project_artist_links=${missingProjectArtistLinks.length}`,
        detail: 'legacy artist.project_id 기준 링크가 v2_project_artists에 존재해야 함',
      },
      {
        key: 'product_project_mapping_consistent',
        passed: productProjectMappingMismatch.length === 0,
        expected: 'product_project_mapping_mismatch=0',
        actual: `product_project_mapping_mismatch=${productProjectMappingMismatch.length}`,
        detail: 'v2_products.project_id가 legacy product.project_id 매핑과 일치해야 함',
      },
      {
        key: 'v2_products_have_variants',
        passed: productsWithoutVariants.length === 0,
        expected: 'products_without_variants=0',
        actual: `products_without_variants=${productsWithoutVariants.length}`,
        detail: '모든 v2 product는 최소 1개의 variant를 가져야 함',
      },
      {
        key: 'active_products_have_primary_media',
        passed: activeProductsWithoutPrimaryMedia.length === 0,
        expected: 'active_products_without_primary_media=0',
        actual: `active_products_without_primary_media=${activeProductsWithoutPrimaryMedia.length}`,
        detail: 'ACTIVE product는 ACTIVE primary media를 가져야 함',
      },
      {
        key: 'digital_variants_have_assets',
        passed: digitalVariantsWithoutAssets.length === 0,
        expected: 'digital_variants_without_assets=0',
        actual: `digital_variants_without_assets=${digitalVariantsWithoutAssets.length}`,
        detail: 'DIGITAL variant는 최소 1개의 digital asset을 가져야 함',
      },
      {
        key: 'active_digital_variants_have_ready_assets',
        passed: activeDigitalVariantsWithoutReadyAsset.length === 0,
        expected: 'active_digital_variants_without_ready_asset=0',
        actual: `active_digital_variants_without_ready_asset=${activeDigitalVariantsWithoutReadyAsset.length}`,
        detail: 'ACTIVE DIGITAL variant는 READY asset을 가져야 함',
      },
    ];

    const blockingChecks = checks
      .filter((check) => !check.passed)
      .map((check) => check.key);

    return {
      generated_at: new Date().toISOString(),
      sample_limit: safeSampleLimit,
      counts: {
        legacy: {
          projects: legacyProjects.length,
          artists: legacyArtists.length,
          products: legacyProducts.length,
          digital_products: legacyProducts.filter(
            (product) => product.type === 'VOICE_PACK',
          ).length,
        },
        v2: {
          projects_total: v2Projects.length,
          projects_mapped: backfilledProjects.length,
          artists_total: v2Artists.length,
          artists_mapped: backfilledArtists.length,
          products_total: v2Products.length,
          products_mapped: backfilledProducts.length,
          variants_total: v2Variants.length,
          product_media_total: v2ProductMedia.length,
          digital_assets_total: v2DigitalAssets.length,
        },
      },
      checks,
      differences: {
        missing_mappings: {
          projects: this.buildMigrationSample(
            missingProjectMappings,
            safeSampleLimit,
            (project) => ({
              legacy_project_id: project.id,
              name: project.name,
              slug: project.slug,
            }),
          ),
          artists: this.buildMigrationSample(
            missingArtistMappings,
            safeSampleLimit,
            (artist) => ({
              legacy_artist_id: artist.id,
              project_id: artist.project_id,
              name: artist.name,
              slug: artist.slug,
            }),
          ),
          products: this.buildMigrationSample(
            missingProductMappings,
            safeSampleLimit,
            (product) => ({
              legacy_product_id: product.id,
              project_id: product.project_id,
              title: product.name,
              slug: product.slug,
              type: product.type,
            }),
          ),
        },
        orphan_mappings: {
          projects: this.buildMigrationSample(
            orphanProjectMappings,
            safeSampleLimit,
            (project) => ({
              v2_project_id: project.id,
              legacy_project_id: project.legacy_project_id,
              slug: project.slug,
            }),
          ),
          artists: this.buildMigrationSample(
            orphanArtistMappings,
            safeSampleLimit,
            (artist) => ({
              v2_artist_id: artist.id,
              legacy_artist_id: artist.legacy_artist_id,
              slug: artist.slug,
            }),
          ),
          products: this.buildMigrationSample(
            orphanProductMappings,
            safeSampleLimit,
            (product) => ({
              v2_product_id: product.id,
              legacy_product_id: product.legacy_product_id,
              slug: product.slug,
            }),
          ),
        },
        data_mismatch: {
          project_slug: this.buildMigrationSample(
            projectSlugMismatch,
            safeSampleLimit,
          ),
          artist_slug: this.buildMigrationSample(
            artistSlugMismatch,
            safeSampleLimit,
          ),
          product_slug_rank1: this.buildMigrationSample(
            productSlugMismatch,
            safeSampleLimit,
          ),
          product_project_mapping: this.buildMigrationSample(
            productProjectMappingMismatch,
            safeSampleLimit,
          ),
        },
        integrity: {
          missing_project_artist_links: this.buildMigrationSample(
            missingProjectArtistLinks,
            safeSampleLimit,
            (artist) => ({
              legacy_artist_id: artist.id,
              legacy_project_id: artist.project_id,
              name: artist.name,
              slug: artist.slug,
            }),
          ),
          products_without_variants: this.buildMigrationSample(
            productsWithoutVariants,
            safeSampleLimit,
            (product) => ({
              v2_product_id: product.id,
              legacy_product_id: product.legacy_product_id,
              title: product.title,
              slug: product.slug,
            }),
          ),
          active_products_without_primary_media: this.buildMigrationSample(
            activeProductsWithoutPrimaryMedia,
            safeSampleLimit,
            (product) => ({
              v2_product_id: product.id,
              legacy_product_id: product.legacy_product_id,
              title: product.title,
              slug: product.slug,
            }),
          ),
          digital_variants_without_assets: this.buildMigrationSample(
            digitalVariantsWithoutAssets,
            safeSampleLimit,
            (variant) => ({
              v2_variant_id: variant.id,
              v2_product_id: variant.product_id,
              status: variant.status,
            }),
          ),
          active_digital_variants_without_ready_asset: this.buildMigrationSample(
            activeDigitalVariantsWithoutReadyAsset,
            safeSampleLimit,
            (variant) => ({
              v2_variant_id: variant.id,
              v2_product_id: variant.product_id,
              status: variant.status,
            }),
          ),
        },
      },
      read_switch: {
        ready: blockingChecks.length === 0,
        blocking_checks: blockingChecks,
        recommended_order: [
          'admin 비교 read',
          '신규 생성 v2 write',
          '전체 read 전환',
        ],
      },
    };
  }

  async getReadSwitchChecklist(sampleLimit = 20): Promise<any> {
    const compareReport = await this.getMigrationCompareReport(sampleLimit);
    const checklist = (compareReport.checks as MigrationCheckResult[]).map(
      (check) => ({
        key: check.key,
        passed: check.passed,
        detail: check.detail,
        action: this.resolveReadSwitchAction(check.key),
      }),
    );

    const passedChecks = checklist.filter((item) => item.passed).length;

    return {
      generated_at: compareReport.generated_at,
      ready: compareReport.read_switch.ready,
      total_checks: checklist.length,
      passed_checks: passedChecks,
      failed_checks: checklist.length - passedChecks,
      blocking_checks: compareReport.read_switch.blocking_checks,
      checklist,
      recommended_order: compareReport.read_switch.recommended_order,
    };
  }

  private normalizeMigrationSampleLimit(sampleLimit: number): number {
    if (!Number.isFinite(sampleLimit)) {
      return 20;
    }

    const normalized = Math.floor(sampleLimit);
    if (normalized < 5) {
      return 5;
    }
    if (normalized > 200) {
      return 200;
    }
    return normalized;
  }

  private async fetchLegacyRows(
    table: string,
    select: string,
    errorMessage: string,
    errorCode: string,
  ): Promise<any[]> {
    const { data, error } = await this.supabase.from(table).select(select);
    if (error) {
      throw new ApiException(errorMessage, 500, errorCode);
    }
    return data || [];
  }

  private async fetchV2Rows(
    table: string,
    select: string,
    errorMessage: string,
    errorCode: string,
  ): Promise<any[]> {
    const { data, error } = await this.supabase
      .from(table)
      .select(select)
      .is('deleted_at', null);

    if (error) {
      throw new ApiException(errorMessage, 500, errorCode);
    }
    return data || [];
  }

  private buildMigrationSample(
    rows: any[],
    limit: number,
    mapper?: (row: any) => any,
  ): any[] {
    const sampled = rows.slice(0, limit);
    if (!mapper) {
      return sampled;
    }
    return sampled.map(mapper);
  }

  private extractSlugRank(metadata: unknown): number | null {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }

    const raw = (metadata as Record<string, unknown>).slug_rank;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return raw;
    }
    if (typeof raw === 'string' && raw.length > 0) {
      const parsed = Number.parseInt(raw, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return null;
  }

  private resolveReadSwitchAction(checkKey: string): string {
    const actions: Record<string, string> = {
      projects_backfill_complete: 'legacy projects 누락 매핑을 백필 SQL로 보정',
      artists_backfill_complete: 'legacy artists 누락 매핑을 백필 SQL로 보정',
      products_backfill_complete: 'legacy products 누락 매핑을 백필 SQL로 보정',
      project_artist_links_complete:
        'legacy artist.project_id 기준으로 v2_project_artists 링크 보정',
      product_project_mapping_consistent:
        'v2_products.project_id와 legacy project 매핑 불일치 건 보정',
      v2_products_have_variants: 'variant 없는 product에 기본 variant 생성',
      active_products_have_primary_media:
        'ACTIVE product에 ACTIVE primary media 추가 또는 상태 조정',
      digital_variants_have_assets:
        'DIGITAL variant에 최소 1개 digital asset 등록',
      active_digital_variants_have_ready_assets:
        'ACTIVE DIGITAL variant에 READY 상태 asset 준비',
    };

    return actions[checkKey] || '차이 리포트 샘플을 확인하고 데이터 정합성 보정';
  }

  private async ensureProjectExists(projectId: string): Promise<void> {
    await this.getProjectById(projectId);
  }

  private async ensureArtistExists(artistId: string): Promise<void> {
    await this.getArtistById(artistId);
  }

  private async ensureProductExists(productId: string): Promise<void> {
    await this.getProductById(productId);
  }

  private async ensureVariantExists(variantId: string): Promise<void> {
    await this.getVariantById(variantId);
  }

  private async getVariantById(variantId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_product_variants')
      .select('*')
      .eq('id', variantId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'v2 variant 조회 실패',
        500,
        'V2_VARIANT_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'v2 variant를 찾을 수 없습니다',
        404,
        'V2_VARIANT_NOT_FOUND',
      );
    }

    return data;
  }

  private async getMediaById(mediaId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_product_media')
      .select('*')
      .eq('id', mediaId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'v2 media 조회 실패',
        500,
        'V2_PRODUCT_MEDIA_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'v2 media를 찾을 수 없습니다',
        404,
        'V2_PRODUCT_MEDIA_NOT_FOUND',
      );
    }

    return data;
  }

  private async getDigitalAssetById(assetId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_digital_assets')
      .select('*')
      .eq('id', assetId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'v2 digital asset 조회 실패',
        500,
        'V2_DIGITAL_ASSET_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'v2 digital asset를 찾을 수 없습니다',
        404,
        'V2_DIGITAL_ASSET_NOT_FOUND',
      );
    }

    return data;
  }

  private async clearPrimaryMedia(
    productId: string,
    excludeMediaId?: string,
  ): Promise<void> {
    let query = this.supabase
      .from('v2_product_media')
      .update({ is_primary: false })
      .eq('product_id', productId)
      .is('deleted_at', null);

    if (excludeMediaId) {
      query = query.neq('id', excludeMediaId);
    }

    const { error } = await query;
    if (error) {
      throw new ApiException(
        '기존 primary media 해제 실패',
        500,
        'V2_PRODUCT_MEDIA_UPDATE_FAILED',
      );
    }
  }

  private async getNextDigitalAssetVersion(
    variantId: string,
    assetRole: V2AssetRole,
  ): Promise<number> {
    const { data, error } = await this.supabase
      .from('v2_digital_assets')
      .select('version_no')
      .eq('variant_id', variantId)
      .eq('asset_role', assetRole)
      .order('version_no', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'digital asset 버전 조회 실패',
        500,
        'V2_DIGITAL_ASSET_FETCH_FAILED',
      );
    }

    return (data?.version_no ?? 0) + 1;
  }

  private async assertProjectSlugAvailable(
    slug: string,
    excludeProjectId?: string,
  ): Promise<void> {
    let query = this.supabase
      .from('v2_projects')
      .select('id')
      .eq('slug', slug)
      .is('deleted_at', null);

    if (excludeProjectId) {
      query = query.neq('id', excludeProjectId);
    }

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) {
      throw new ApiException(
        'v2 프로젝트 slug 중복 검사 실패',
        500,
        'V2_PROJECT_FETCH_FAILED',
      );
    }
    if (data) {
      throw new ApiException(
        '이미 사용 중인 프로젝트 slug입니다',
        409,
        'SLUG_ALREADY_EXISTS',
      );
    }
  }

  private async assertArtistSlugAvailable(
    slug: string,
    excludeArtistId?: string,
  ): Promise<void> {
    let query = this.supabase
      .from('v2_artists')
      .select('id')
      .eq('slug', slug)
      .is('deleted_at', null);

    if (excludeArtistId) {
      query = query.neq('id', excludeArtistId);
    }

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) {
      throw new ApiException(
        'v2 아티스트 slug 중복 검사 실패',
        500,
        'V2_ARTIST_FETCH_FAILED',
      );
    }
    if (data) {
      throw new ApiException(
        '이미 사용 중인 아티스트 slug입니다',
        409,
        'SLUG_ALREADY_EXISTS',
      );
    }
  }

  private async assertProductSlugAvailable(
    projectId: string,
    slug: string,
    excludeProductId?: string,
  ): Promise<void> {
    let query = this.supabase
      .from('v2_products')
      .select('id')
      .eq('project_id', projectId)
      .eq('slug', slug)
      .is('deleted_at', null);

    if (excludeProductId) {
      query = query.neq('id', excludeProductId);
    }

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) {
      throw new ApiException(
        'v2 상품 slug 중복 검사 실패',
        500,
        'V2_PRODUCT_FETCH_FAILED',
      );
    }
    if (data) {
      throw new ApiException(
        '해당 project 내에서 이미 사용 중인 상품 slug입니다',
        409,
        'SLUG_ALREADY_EXISTS',
      );
    }
  }

  private async assertSkuAvailable(
    sku: string,
    excludeVariantId?: string,
  ): Promise<void> {
    let query = this.supabase
      .from('v2_product_variants')
      .select('id')
      .eq('sku', sku)
      .is('deleted_at', null);

    if (excludeVariantId) {
      query = query.neq('id', excludeVariantId);
    }

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) {
      throw new ApiException(
        'v2 variant sku 중복 검사 실패',
        500,
        'V2_VARIANT_FETCH_FAILED',
      );
    }
    if (data) {
      throw new ApiException(
        '이미 사용 중인 sku입니다',
        409,
        'SKU_ALREADY_EXISTS',
      );
    }
  }

  private assertProjectStatus(value: string): void {
    const allowed: V2ProjectStatus[] = ['DRAFT', 'ACTIVE', 'ARCHIVED'];
    if (!allowed.includes(value as V2ProjectStatus)) {
      throw new ApiException(
        'project status 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertArtistStatus(value: string): void {
    const allowed: V2ArtistStatus[] = ['DRAFT', 'ACTIVE', 'ARCHIVED'];
    if (!allowed.includes(value as V2ArtistStatus)) {
      throw new ApiException(
        'artist status 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertProductKind(value: string): void {
    const allowed: V2ProductKind[] = ['STANDARD', 'BUNDLE'];
    if (!allowed.includes(value as V2ProductKind)) {
      throw new ApiException(
        'product_kind 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertProductStatus(value: string): void {
    const allowed: V2ProductStatus[] = ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'];
    if (!allowed.includes(value as V2ProductStatus)) {
      throw new ApiException(
        'product status 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertFulfillmentType(value: string): void {
    const allowed: V2FulfillmentType[] = ['DIGITAL', 'PHYSICAL'];
    if (!allowed.includes(value as V2FulfillmentType)) {
      throw new ApiException(
        'fulfillment_type 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertVariantStatus(value: string): void {
    const allowed: V2VariantStatus[] = ['DRAFT', 'ACTIVE', 'INACTIVE'];
    if (!allowed.includes(value as V2VariantStatus)) {
      throw new ApiException(
        'variant status 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertMediaType(value: string): void {
    const allowed: V2MediaType[] = ['IMAGE', 'VIDEO'];
    if (!allowed.includes(value as V2MediaType)) {
      throw new ApiException(
        'media_type 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertMediaRole(value: string): void {
    const allowed: V2MediaRole[] = ['PRIMARY', 'GALLERY', 'DETAIL'];
    if (!allowed.includes(value as V2MediaRole)) {
      throw new ApiException(
        'media_role 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertMediaStatus(value: string): void {
    const allowed: V2MediaStatus[] = ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'];
    if (!allowed.includes(value as V2MediaStatus)) {
      throw new ApiException(
        'media status 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertAssetRole(value: string): void {
    const allowed: V2AssetRole[] = ['PRIMARY', 'BONUS'];
    if (!allowed.includes(value as V2AssetRole)) {
      throw new ApiException(
        'asset_role 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertDigitalAssetStatus(value: string): void {
    const allowed: V2DigitalAssetStatus[] = ['DRAFT', 'READY', 'RETIRED'];
    if (!allowed.includes(value as V2DigitalAssetStatus)) {
      throw new ApiException(
        'digital asset status 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertProjectStatusTransition(current: V2ProjectStatus, next: V2ProjectStatus): void {
    const allowed: Record<V2ProjectStatus, V2ProjectStatus[]> = {
      DRAFT: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
      ACTIVE: ['ACTIVE', 'DRAFT', 'ARCHIVED'],
      ARCHIVED: ['ARCHIVED'],
    };
    if (!allowed[current].includes(next)) {
      throw new ApiException(
        `허용되지 않는 project 상태 전이입니다: ${current} -> ${next}`,
        400,
        'INVALID_STATUS_TRANSITION',
      );
    }
  }

  private assertProductStatusTransition(current: V2ProductStatus, next: V2ProductStatus): void {
    const allowed: Record<V2ProductStatus, V2ProductStatus[]> = {
      DRAFT: ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'],
      ACTIVE: ['ACTIVE', 'INACTIVE', 'ARCHIVED'],
      INACTIVE: ['INACTIVE', 'ACTIVE', 'ARCHIVED'],
      ARCHIVED: ['ARCHIVED'],
    };
    if (!allowed[current].includes(next)) {
      throw new ApiException(
        `허용되지 않는 product 상태 전이입니다: ${current} -> ${next}`,
        400,
        'INVALID_STATUS_TRANSITION',
      );
    }
  }

  private assertVariantStatusTransition(current: V2VariantStatus, next: V2VariantStatus): void {
    const allowed: Record<V2VariantStatus, V2VariantStatus[]> = {
      DRAFT: ['DRAFT', 'ACTIVE', 'INACTIVE'],
      ACTIVE: ['ACTIVE', 'INACTIVE'],
      INACTIVE: ['INACTIVE', 'ACTIVE'],
    };
    if (!allowed[current].includes(next)) {
      throw new ApiException(
        `허용되지 않는 variant 상태 전이입니다: ${current} -> ${next}`,
        400,
        'INVALID_STATUS_TRANSITION',
      );
    }
  }

  private assertDigitalAssetStatusTransition(
    current: V2DigitalAssetStatus,
    next: V2DigitalAssetStatus,
  ): void {
    const allowed: Record<V2DigitalAssetStatus, V2DigitalAssetStatus[]> = {
      DRAFT: ['DRAFT', 'READY', 'RETIRED'],
      READY: ['READY', 'RETIRED'],
      RETIRED: ['RETIRED', 'READY'],
    };
    if (!allowed[current].includes(next)) {
      throw new ApiException(
        `허용되지 않는 digital asset 상태 전이입니다: ${current} -> ${next}`,
        400,
        'INVALID_STATUS_TRANSITION',
      );
    }
  }

  private assertSortOrder(sortOrder: number | undefined): void {
    if (sortOrder === undefined) {
      return;
    }
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      throw new ApiException(
        'sort_order는 0 이상의 정수여야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertWeight(value: number | null | undefined): void {
    if (value === undefined || value === null) {
      return;
    }
    if (!Number.isInteger(value) || value < 0) {
      throw new ApiException(
        'weight_grams는 0 이상의 정수여야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertPositiveInteger(value: number | undefined, fieldName: string): void {
    if (value === undefined || !Number.isInteger(value) || value <= 0) {
      throw new ApiException(
        `${fieldName}은 1 이상의 정수여야 합니다`,
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private normalizeRequiredText(value: string | undefined, errorMessage: string): string {
    const normalized = value?.trim();
    if (!normalized) {
      throw new ApiException(errorMessage, 400, 'VALIDATION_ERROR');
    }
    return normalized;
  }

  private normalizeOptionalText(value: string | null | undefined): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
}
