import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ApiException } from '../common/errors/api.exception';
import {
  abortMultipartUploadToR2,
  buildR2PublicUrl,
  completeMultipartUploadToR2,
  createMultipartUploadToR2,
  createPresignedMultipartUploadPartUrlToR2,
  createPresignedUploadUrlToR2,
  deleteFileFromR2,
  getR2ObjectMetadata,
} from '../images/r2.util';
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
type V2MediaAssetKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'ARCHIVE' | 'FILE';
type V2MediaAssetStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
type V2MediaAssetUploadSessionStatus =
  | 'INITIATED'
  | 'UPLOADING'
  | 'COMPLETING'
  | 'COMPLETED'
  | 'ABORTED'
  | 'FAILED'
  | 'EXPIRED';
type V2BundleMode = 'FIXED' | 'CUSTOMIZABLE';
type V2BundleStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
type V2BundlePricingStrategy = 'WEIGHTED' | 'FIXED_AMOUNT';
type V2CampaignType = 'POPUP' | 'EVENT' | 'SALE' | 'DROP' | 'ALWAYS_ON';
type V2CampaignStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED' | 'ARCHIVED';
type V2CampaignTargetType =
  | 'PROJECT'
  | 'PRODUCT'
  | 'VARIANT'
  | 'BUNDLE_DEFINITION';
type V2PriceListScope = 'BASE' | 'OVERRIDE';
type V2PriceListStatus = 'DRAFT' | 'PUBLISHED' | 'ROLLED_BACK' | 'ARCHIVED';
type V2PriceItemStatus = 'ACTIVE' | 'INACTIVE';
type V2PromotionType =
  | 'ITEM_PERCENT'
  | 'ITEM_FIXED'
  | 'ORDER_PERCENT'
  | 'ORDER_FIXED'
  | 'SHIPPING_PERCENT'
  | 'SHIPPING_FIXED';
type V2PromotionStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
type V2CombinabilityMode = 'STACKABLE' | 'EXCLUSIVE';
type V2PromotionRuleType =
  | 'MIN_ORDER_AMOUNT'
  | 'MIN_ITEM_QUANTITY'
  | 'TARGET_PROJECT'
  | 'TARGET_PRODUCT'
  | 'TARGET_VARIANT'
  | 'TARGET_BUNDLE'
  | 'CHANNEL'
  | 'USER_SEGMENT';
type V2CouponStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'PAUSED'
  | 'EXHAUSTED'
  | 'EXPIRED'
  | 'ARCHIVED';
type V2CouponRedemptionStatus =
  | 'RESERVED'
  | 'APPLIED'
  | 'RELEASED'
  | 'CANCELED'
  | 'EXPIRED';

interface CampaignTargetEligibilityBucket {
  projectIds: Set<string>;
  productIds: Set<string>;
  variantIds: Set<string>;
}

interface CampaignTargetEligibilityScope {
  include: CampaignTargetEligibilityBucket;
  exclude: CampaignTargetEligibilityBucket;
  hasIncludeTargets: boolean;
}

interface CreateV2ProjectInput {
  name?: string;
  slug?: string;
  description?: string | null;
  cover_media_asset_id?: string | null;
  sort_order?: number;
  metadata?: Record<string, unknown>;
}

interface UpdateV2ProjectInput {
  name?: string;
  slug?: string;
  description?: string | null;
  cover_media_asset_id?: string | null;
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
  fulfillment_type?: V2FulfillmentType | null;
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
  fulfillment_type?: V2FulfillmentType | null;
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
  media_asset_id?: string;
  alt_text?: string | null;
  sort_order?: number;
  is_primary?: boolean;
  status?: V2MediaStatus;
  metadata?: Record<string, unknown>;
}

interface UpdateV2MediaInput {
  media_type?: V2MediaType;
  media_role?: V2MediaRole;
  media_asset_id?: string;
  alt_text?: string | null;
  sort_order?: number;
  is_primary?: boolean;
  status?: V2MediaStatus;
  metadata?: Record<string, unknown>;
}

interface CreateV2DigitalAssetInput {
  asset_role?: V2AssetRole;
  media_asset_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  version_no?: number;
  checksum?: string | null;
  status?: V2DigitalAssetStatus;
  metadata?: Record<string, unknown>;
}

interface UpdateV2DigitalAssetInput {
  media_asset_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  checksum?: string | null;
  status?: V2DigitalAssetStatus;
  metadata?: Record<string, unknown>;
}

interface CreateV2BundleDefinitionInput {
  bundle_product_id?: string;
  anchor_product_id?: string;
  mode?: V2BundleMode;
  status?: V2BundleStatus;
  pricing_strategy?: V2BundlePricingStrategy;
  version_no?: number;
  metadata?: Record<string, unknown>;
}

interface UpdateV2BundleDefinitionInput {
  mode?: V2BundleMode;
  status?: V2BundleStatus;
  pricing_strategy?: V2BundlePricingStrategy;
  metadata?: Record<string, unknown>;
}

interface CloneV2BundleDefinitionVersionInput {
  metadata_patch?: Record<string, unknown>;
}

interface CreateV2BundleComponentInput {
  component_variant_id?: string;
  is_required?: boolean;
  min_quantity?: number;
  max_quantity?: number;
  default_quantity?: number;
  sort_order?: number;
  price_allocation_weight?: number;
  metadata?: Record<string, unknown>;
}

interface UpdateV2BundleComponentInput {
  component_variant_id?: string;
  is_required?: boolean;
  min_quantity?: number;
  max_quantity?: number;
  default_quantity?: number;
  sort_order?: number;
  price_allocation_weight?: number;
  metadata?: Record<string, unknown>;
}

interface CreateV2BundleComponentOptionInput {
  option_key?: string;
  option_value?: string;
  sort_order?: number;
  metadata?: Record<string, unknown>;
}

interface UpdateV2BundleComponentOptionInput {
  option_key?: string;
  option_value?: string;
  sort_order?: number;
  metadata?: Record<string, unknown>;
}

interface GetMediaAssetsInput {
  kind?: V2MediaAssetKind;
  status?: V2MediaAssetStatus;
  search?: string;
}

interface CreateMediaAssetInput {
  asset_kind?: V2MediaAssetKind;
  storage_provider?: string;
  storage_bucket?: string | null;
  storage_path?: string;
  public_url?: string | null;
  file_name?: string;
  mime_type?: string | null;
  file_size?: number | null;
  checksum?: string | null;
  status?: V2MediaAssetStatus;
  metadata?: Record<string, unknown>;
}

interface UpdateMediaAssetInput {
  asset_kind?: V2MediaAssetKind;
  storage_bucket?: string | null;
  storage_path?: string;
  public_url?: string | null;
  file_name?: string;
  mime_type?: string | null;
  file_size?: number | null;
  checksum?: string | null;
  status?: V2MediaAssetStatus;
  metadata?: Record<string, unknown>;
}

interface PrepareMediaAssetUploadInput {
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  asset_kind?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

interface CompleteMediaAssetUploadInput {
  storage_path?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  asset_kind?: string;
  status?: string;
  checksum?: string | null;
  metadata?: Record<string, unknown>;
}

interface InitiateMultipartMediaAssetUploadInput {
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  asset_kind?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

interface SignMultipartMediaAssetUploadPartsInput {
  session_id?: string;
  part_numbers?: number[];
}

interface CompleteMultipartMediaAssetUploadInput {
  session_id?: string;
  parts?: Array<{
    part_number: number;
    etag: string;
  }>;
}

interface BundleComponentSelectionInput {
  component_variant_id?: string;
  quantity?: number;
}

interface ValidateV2BundleDefinitionInput {
  selected_components?: BundleComponentSelectionInput[];
}

interface ResolveV2BundleInput {
  bundle_definition_id?: string;
  parent_variant_id?: string | null;
  parent_quantity?: number;
  parent_unit_amount?: number | null;
  selected_components?: BundleComponentSelectionInput[];
}

interface BuildV2BundleOpsContractInput {
  bundle_definition_id?: string;
  parent_variant_id?: string | null;
  parent_quantity?: number;
  parent_unit_amount?: number | null;
  selected_components?: BundleComponentSelectionInput[];
}

interface BuildV2BundleCanaryReportInput {
  definition_ids?: string[];
  sample_parent_quantity?: number;
  sample_parent_unit_amount?: number | null;
}

interface PreviewV2BundleInput {
  bundle_definition_id?: string;
  parent_quantity?: number;
  selected_components?: BundleComponentSelectionInput[];
}

interface CreateV2CampaignInput {
  code?: string;
  name?: string;
  description?: string | null;
  campaign_type?: V2CampaignType;
  status?: V2CampaignStatus;
  starts_at?: string | null;
  ends_at?: string | null;
  shop_banner_media_asset_id?: string | null;
  shop_banner_alt_text?: string | null;
  channel_scope_json?: unknown;
  purchase_limit_json?: unknown;
  source_type?: string | null;
  source_id?: string | null;
  source_snapshot_json?: unknown;
  metadata?: Record<string, unknown>;
}

interface UpdateV2CampaignInput {
  code?: string;
  name?: string;
  description?: string | null;
  campaign_type?: V2CampaignType;
  status?: V2CampaignStatus;
  starts_at?: string | null;
  ends_at?: string | null;
  shop_banner_media_asset_id?: string | null;
  shop_banner_alt_text?: string | null;
  channel_scope_json?: unknown;
  purchase_limit_json?: unknown;
  source_type?: string | null;
  source_id?: string | null;
  source_snapshot_json?: unknown;
  metadata?: Record<string, unknown>;
}

interface CreateV2CampaignTargetInput {
  target_type?: V2CampaignTargetType;
  target_id?: string;
  sort_order?: number;
  is_excluded?: boolean;
  source_type?: string | null;
  source_id?: string | null;
  source_snapshot_json?: unknown;
  metadata?: Record<string, unknown>;
}

interface UpdateV2CampaignTargetInput {
  target_type?: V2CampaignTargetType;
  target_id?: string;
  sort_order?: number;
  is_excluded?: boolean;
  source_type?: string | null;
  source_id?: string | null;
  source_snapshot_json?: unknown;
  metadata?: Record<string, unknown>;
}

interface CreateV2PriceListInput {
  campaign_id?: string | null;
  name?: string;
  scope_type?: V2PriceListScope;
  status?: V2PriceListStatus;
  currency_code?: string;
  priority?: number;
  starts_at?: string | null;
  ends_at?: string | null;
  channel_scope_json?: unknown;
  source_type?: string | null;
  source_id?: string | null;
  source_snapshot_json?: unknown;
  metadata?: Record<string, unknown>;
}

interface UpdateV2PriceListInput {
  campaign_id?: string | null;
  rollback_of_price_list_id?: string | null;
  name?: string;
  scope_type?: V2PriceListScope;
  status?: V2PriceListStatus;
  currency_code?: string;
  priority?: number;
  published_at?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  channel_scope_json?: unknown;
  source_type?: string | null;
  source_id?: string | null;
  source_snapshot_json?: unknown;
  metadata?: Record<string, unknown>;
}

interface CreateV2PriceListItemInput {
  product_id?: string;
  variant_id?: string | null;
  status?: V2PriceItemStatus;
  unit_amount?: number;
  compare_at_amount?: number | null;
  min_purchase_quantity?: number;
  max_purchase_quantity?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  channel_scope_json?: unknown;
  source_type?: string | null;
  source_id?: string | null;
  source_snapshot_json?: unknown;
  metadata?: Record<string, unknown>;
}

interface UpdateV2PriceListItemInput {
  product_id?: string;
  variant_id?: string | null;
  status?: V2PriceItemStatus;
  unit_amount?: number;
  compare_at_amount?: number | null;
  min_purchase_quantity?: number;
  max_purchase_quantity?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  channel_scope_json?: unknown;
  source_type?: string | null;
  source_id?: string | null;
  source_snapshot_json?: unknown;
  metadata?: Record<string, unknown>;
}

interface CreateV2PromotionInput {
  campaign_id?: string | null;
  name?: string;
  description?: string | null;
  promotion_type?: V2PromotionType;
  status?: V2PromotionStatus;
  combinability_mode?: V2CombinabilityMode;
  coupon_required?: boolean;
  priority?: number;
  discount_value?: number;
  max_discount_amount?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  channel_scope_json?: unknown;
  purchase_limit_json?: unknown;
  source_type?: string | null;
  source_id?: string | null;
  source_snapshot_json?: unknown;
  metadata?: Record<string, unknown>;
}

interface UpdateV2PromotionInput {
  campaign_id?: string | null;
  name?: string;
  description?: string | null;
  promotion_type?: V2PromotionType;
  status?: V2PromotionStatus;
  combinability_mode?: V2CombinabilityMode;
  coupon_required?: boolean;
  priority?: number;
  discount_value?: number;
  max_discount_amount?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  channel_scope_json?: unknown;
  purchase_limit_json?: unknown;
  source_type?: string | null;
  source_id?: string | null;
  source_snapshot_json?: unknown;
  metadata?: Record<string, unknown>;
}

interface CreateV2PromotionRuleInput {
  rule_type?: V2PromotionRuleType;
  status?: V2PriceItemStatus;
  sort_order?: number;
  rule_payload?: unknown;
  source_type?: string | null;
  source_id?: string | null;
  source_snapshot_json?: unknown;
  metadata?: Record<string, unknown>;
}

interface UpdateV2PromotionRuleInput {
  rule_type?: V2PromotionRuleType;
  status?: V2PriceItemStatus;
  sort_order?: number;
  rule_payload?: unknown;
  source_type?: string | null;
  source_id?: string | null;
  source_snapshot_json?: unknown;
  metadata?: Record<string, unknown>;
}

interface CreateV2CouponInput {
  promotion_id?: string | null;
  code?: string;
  status?: V2CouponStatus;
  starts_at?: string | null;
  ends_at?: string | null;
  max_issuance?: number | null;
  max_redemptions_per_user?: number;
  channel_scope_json?: unknown;
  purchase_limit_json?: unknown;
  source_type?: string | null;
  source_id?: string | null;
  source_snapshot_json?: unknown;
  metadata?: Record<string, unknown>;
}

interface UpdateV2CouponInput {
  promotion_id?: string | null;
  code?: string;
  status?: V2CouponStatus;
  starts_at?: string | null;
  ends_at?: string | null;
  max_issuance?: number | null;
  max_redemptions_per_user?: number;
  channel_scope_json?: unknown;
  purchase_limit_json?: unknown;
  source_type?: string | null;
  source_id?: string | null;
  source_snapshot_json?: unknown;
  metadata?: Record<string, unknown>;
}

interface ValidateV2CouponInput {
  code?: string;
  user_id?: string | null;
  campaign_id?: string | null;
  channel?: string | null;
  evaluated_at?: string | null;
}

interface ReserveV2CouponInput {
  user_id?: string;
  quote_reference?: string | null;
  expires_at?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  source_snapshot_json?: unknown;
  metadata?: Record<string, unknown>;
}

interface ReleaseV2CouponRedemptionInput {
  reason?: string | null;
}

interface RedeemV2CouponRedemptionInput {
  order_id?: string | null;
  metadata?: Record<string, unknown>;
}

interface PriceQuoteLineInput {
  variant_id?: string;
  quantity?: number;
}

interface BuildV2PriceQuoteInput {
  lines?: PriceQuoteLineInput[];
  campaign_id?: string | null;
  channel?: string | null;
  coupon_code?: string | null;
  user_id?: string | null;
  shipping_amount?: number | null;
  quote_reference?: string | null;
  evaluated_at?: string | null;
}

type V2ShopSort = 'SORT_ORDER' | 'LATEST' | 'OLDEST' | 'TITLE_ASC' | 'TITLE_DESC';

interface GetV2ShopProductsInput {
  cursor?: string;
  limit?: number;
  sort?: string;
  channel?: string | null;
  campaign_id?: string | null;
  include_unsellable?: boolean;
}

interface GetV2ShopCampaignsInput {
  channel?: string | null;
  include_upcoming?: boolean;
}

interface GetV2ShopCouponsInput {
  campaign_id?: string | null;
  channel?: string | null;
}

interface GetV2ShopProductDetailInput {
  channel?: string | null;
  campaign_id?: string | null;
}

interface GetV2ShopPricePreviewInput {
  variant_id?: string;
  quantity?: number;
  campaign_id?: string | null;
  channel?: string | null;
  coupon_code?: string | null;
  user_id?: string | null;
  shipping_amount?: number | null;
}

interface MigrationCheckResult {
  key: string;
  passed: boolean;
  severity: 'BLOCKING' | 'ADVISORY';
  expected: string;
  actual: string;
  detail: string;
}

interface ReadSwitchRemediationTask {
  check_key: string;
  severity: 'BLOCKING' | 'ADVISORY';
  title: string;
  detail: string;
  expected: string;
  actual: string;
  action: string;
  sample_source: string | null;
  sample_count: number;
  samples: any[];
}

const V2_PROJECT_SELECT_COLUMNS = '*, cover_media_asset:media_assets(*)';

@Injectable()
export class V2CatalogService {
  private get supabase(): any {
    return getSupabaseClient() as any;
  }

  async getProjects(filters: { status?: V2ProjectStatus }): Promise<any[]> {
    let query = this.supabase
      .from('v2_projects')
      .select(V2_PROJECT_SELECT_COLUMNS)
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
      .select(V2_PROJECT_SELECT_COLUMNS)
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
    const coverMediaAssetId = await this.resolveProjectCoverMediaAssetId(
      input.cover_media_asset_id,
    );

    await this.assertProjectSlugAvailable(slug);
    this.assertSortOrder(input.sort_order);

    const { data, error } = await this.supabase
      .from('v2_projects')
      .insert({
        name,
        slug,
        description: this.normalizeOptionalText(input.description),
        cover_media_asset_id: coverMediaAssetId,
        sort_order: input.sort_order ?? 0,
        status: 'DRAFT',
        is_active: false,
        metadata: input.metadata ?? {},
      })
      .select(V2_PROJECT_SELECT_COLUMNS)
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
    if (input.cover_media_asset_id !== undefined) {
      updateData.cover_media_asset_id = await this.resolveProjectCoverMediaAssetId(
        input.cover_media_asset_id,
      );
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
      .select(V2_PROJECT_SELECT_COLUMNS)
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
      .select(V2_PROJECT_SELECT_COLUMNS)
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
      .select(V2_PROJECT_SELECT_COLUMNS)
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

  async getShopProducts(input: GetV2ShopProductsInput = {}): Promise<any> {
    const limit = this.normalizeShopLimit(input.limit);
    const offset = this.normalizeShopOffset(input.cursor);
    const sort = this.normalizeShopSort(input.sort);
    const channel = this.normalizeOptionalText(input.channel);
    const campaignId = this.normalizeOptionalText(input.campaign_id);
    const includeUnsellable = input.include_unsellable ?? false;
    const evaluatedAt = new Date().toISOString();

    const applyShopProductOrder = (query: any) => {
      if (sort === 'LATEST') {
        return query
          .order('created_at', { ascending: false })
          .order('id', { ascending: false });
      }
      if (sort === 'OLDEST') {
        return query
          .order('created_at', { ascending: true })
          .order('id', { ascending: true });
      }
      if (sort === 'TITLE_ASC') {
        return query
          .order('title', { ascending: true })
          .order('id', { ascending: true });
      }
      if (sort === 'TITLE_DESC') {
        return query
          .order('title', { ascending: false })
          .order('id', { ascending: false });
      }
      return query
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
    };

    if (includeUnsellable) {
      const query = applyShopProductOrder(
        this.supabase
          .from('v2_products')
          .select('*', { count: 'exact' })
          .eq('status', 'ACTIVE')
          .is('deleted_at', null),
      );

      const { data, error, count } = await query.range(offset, offset + limit - 1);
      if (error) {
        throw new ApiException(
          'v2 shop 상품 목록 조회 실패',
          500,
          'V2_SHOP_PRODUCTS_FETCH_FAILED',
        );
      }

      const products = data || [];
      const items = await this.buildShopListItems(products, {
        channel,
        campaignId,
        evaluatedAt,
      });
      const total = count ?? items.length;
      const nextOffset = offset + limit;

      return {
        items,
        next_cursor: nextOffset < total ? String(nextOffset) : null,
        summary: {
          total,
        },
      };
    }

    const batchSize = Math.max(limit * 2, 40);
    let rawOffset = offset;
    let rawTotal: number | null = null;
    let reachedEnd = false;
    const exposedItems: any[] = [];

    while (exposedItems.length < limit && !reachedEnd) {
      const query = applyShopProductOrder(
        this.supabase
          .from('v2_products')
          .select('*', { count: 'exact' })
          .eq('status', 'ACTIVE')
          .is('deleted_at', null),
      );

      const { data, error, count } = await query.range(
        rawOffset,
        rawOffset + batchSize - 1,
      );
      if (error) {
        throw new ApiException(
          'v2 shop 상품 목록 조회 실패',
          500,
          'V2_SHOP_PRODUCTS_FETCH_FAILED',
        );
      }

      if (rawTotal === null) {
        rawTotal = count ?? 0;
      }

      const products = data || [];
      if (products.length === 0) {
        reachedEnd = true;
        break;
      }

      const chunkItems = await this.buildShopListItems(products, {
        channel,
        campaignId,
        evaluatedAt,
      });
      const visibleItems = chunkItems.filter((item) => item.display_price !== null);
      const remaining = limit - exposedItems.length;
      exposedItems.push(...visibleItems.slice(0, remaining));

      rawOffset += products.length;
      if (products.length < batchSize) {
        reachedEnd = true;
      }
    }

    const total = rawTotal ?? 0;
    return {
      items: exposedItems,
      next_cursor: !reachedEnd && rawOffset < total ? String(rawOffset) : null,
      summary: {
        total,
      },
    };
  }

  async getShopCampaigns(input: GetV2ShopCampaignsInput = {}): Promise<any[]> {
    const nowIso = new Date().toISOString();
    const channel = this.normalizeOptionalText(input.channel);
    const includeUpcoming = input.include_upcoming ?? false;

    const { data, error } = await this.supabase
      .from('v2_campaigns')
      .select(
        `
        id,
        code,
        name,
        description,
        campaign_type,
        status,
        starts_at,
        ends_at,
        channel_scope_json,
        shop_banner_media_asset_id,
        shop_banner_alt_text,
        shop_banner_media_asset:media_assets(
          public_url
        )
      `,
      )
      .eq('status', 'ACTIVE')
      .neq('campaign_type', 'ALWAYS_ON')
      .is('deleted_at', null)
      .order('starts_at', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: false });

    if (error) {
      throw new ApiException(
        'v2 shop campaign 목록 조회 실패',
        500,
        'V2_SHOP_CAMPAIGNS_FETCH_FAILED',
      );
    }

    return (data || [])
      .filter((campaign: any) => {
        if (!this.matchesChannelScope(campaign.channel_scope_json, channel)) {
          return false;
        }

        if (includeUpcoming) {
          if (
            campaign.ends_at &&
            new Date(campaign.ends_at).getTime() < new Date(nowIso).getTime()
          ) {
            return false;
          }
          return true;
        }

        return this.isTimestampInRange(campaign.starts_at, campaign.ends_at, nowIso);
      })
      .map((campaign: any) => {
        const shopBannerAsset =
          campaign.shop_banner_media_asset &&
          typeof campaign.shop_banner_media_asset === 'object'
            ? campaign.shop_banner_media_asset
            : null;

        return {
          ...campaign,
          shop_banner_public_url:
            this.normalizeOptionalText(
              shopBannerAsset?.public_url as string | null | undefined,
            ) ?? null,
        };
      });
  }

  async getShopCoupons(input: GetV2ShopCouponsInput = {}): Promise<any[]> {
    const nowIso = new Date().toISOString();
    const campaignId = this.normalizeOptionalText(input.campaign_id);
    const channel = this.normalizeOptionalText(input.channel);

    const { data, error } = await this.supabase
      .from('v2_coupons')
      .select(
        `
        id,
        code,
        status,
        starts_at,
        ends_at,
        max_issuance,
        max_redemptions_per_user,
        reserved_count,
        redeemed_count,
        channel_scope_json,
        promotion:v2_promotions(
          id,
          name,
          campaign_id,
          status,
          starts_at,
          ends_at,
          channel_scope_json
        )
      `,
      )
      .eq('status', 'ACTIVE')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new ApiException(
        'v2 shop coupon 목록 조회 실패',
        500,
        'V2_SHOP_COUPONS_FETCH_FAILED',
      );
    }

    return (data || [])
      .filter((coupon: any) => {
        if (!this.isTimestampInRange(coupon.starts_at, coupon.ends_at, nowIso)) {
          return false;
        }
        if (!this.matchesChannelScope(coupon.channel_scope_json, channel)) {
          return false;
        }

        const promotion = coupon.promotion;
        if (!promotion || promotion.status !== 'ACTIVE') {
          return false;
        }
        if (!this.isTimestampInRange(promotion.starts_at, promotion.ends_at, nowIso)) {
          return false;
        }
        if (!this.matchesChannelScope(promotion.channel_scope_json, channel)) {
          return false;
        }
        if (
          campaignId &&
          promotion.campaign_id &&
          promotion.campaign_id !== campaignId
        ) {
          return false;
        }

        const maxIssuance = coupon.max_issuance as number | null;
        const reservedCount = (coupon.reserved_count as number) ?? 0;
        const redeemedCount = (coupon.redeemed_count as number) ?? 0;
        if (
          maxIssuance !== null &&
          maxIssuance !== undefined &&
          reservedCount + redeemedCount >= maxIssuance
        ) {
          return false;
        }
        return true;
      })
      .map((coupon: any) => {
        const maxIssuance = coupon.max_issuance as number | null;
        const reservedCount = (coupon.reserved_count as number) ?? 0;
        const redeemedCount = (coupon.redeemed_count as number) ?? 0;
        return {
          id: coupon.id,
          code: coupon.code,
          status: coupon.status,
          starts_at: coupon.starts_at,
          ends_at: coupon.ends_at,
          max_issuance: maxIssuance,
          max_redemptions_per_user: coupon.max_redemptions_per_user ?? 1,
          reserved_count: reservedCount,
          redeemed_count: redeemedCount,
          available_issuance:
            maxIssuance === null || maxIssuance === undefined
              ? null
              : Math.max(0, maxIssuance - (reservedCount + redeemedCount)),
          promotion_id: coupon.promotion.id,
          promotion_name: coupon.promotion.name,
          campaign_id: coupon.promotion.campaign_id,
        };
      });
  }

  async getShopProductDetail(
    productId: string,
    input: GetV2ShopProductDetailInput = {},
  ): Promise<any> {
    const product = await this.getProductById(productId);
    if (product.status !== 'ACTIVE') {
      throw new ApiException(
        'v2 shop 상품을 찾을 수 없습니다',
        404,
        'V2_SHOP_PRODUCT_NOT_FOUND',
      );
    }

    const channel = this.normalizeOptionalText(input.channel);
    const campaignId = this.normalizeOptionalText(input.campaign_id);
    const evaluatedAt = new Date().toISOString();

    const {
      variantsByProductId,
      mediaByProductId,
      inventoryByVariantId,
      priceItems,
      campaignTargetEligibilityByCampaignId,
      projectStatusById,
    } = await this.loadShopContext([productId], [product.project_id as string | null]);
    const variants = variantsByProductId.get(productId) || [];
    const media = mediaByProductId.get(productId) || [];
    const projectStatus = this.resolveShopProjectStatus(
      product.project_id as string | null,
      projectStatusById,
    );
    const isProjectActive = projectStatus === 'ACTIVE';

    const variantViews = variants.map((variant: any, index: number) => {
      const priceSelection = isProjectActive
        ? this.selectShopPriceItem({
            productId,
            projectId: product.project_id as string | null,
            variantId: variant.id as string,
            priceItems,
            evaluatedAt,
            campaignId,
            channel,
            campaignTargetEligibilityByCampaignId,
          })
        : { selected: null, base: null, override: null };
      const inventoryQuantity = variant.track_inventory
        ? (inventoryByVariantId.get(variant.id as string) ?? null)
        : null;
      const availability = this.buildShopAvailability({
        projectStatus,
        productStatus: product.status as V2ProductStatus,
        variant,
        selectedPriceItem: priceSelection.selected,
        inventoryQuantity,
      });

      return {
        id: variant.id,
        sku: variant.sku,
        title: variant.title,
        fulfillment_type: variant.fulfillment_type,
        requires_shipping: variant.requires_shipping,
        track_inventory: variant.track_inventory,
        status: variant.status,
        is_primary: index === 0,
        availability,
        display_price: priceSelection.selected
          ? {
              amount: priceSelection.selected.unit_amount,
              compare_at_amount: priceSelection.selected.compare_at_amount,
              currency_code: priceSelection.selected.price_list?.currency_code ?? 'KRW',
              source:
                priceSelection.selected.price_list?.scope_type === 'OVERRIDE'
                  ? 'OVERRIDE'
                  : 'BASE',
            }
          : null,
        purchase_constraints: {
          min_quantity: priceSelection.selected?.min_purchase_quantity ?? 1,
          max_quantity: priceSelection.selected?.max_purchase_quantity ?? null,
          channel_scope:
            priceSelection.selected?.channel_scope_json ??
            priceSelection.selected?.price_list?.channel_scope_json ??
            [],
        },
      };
    });

    const hasDisplayPrice = variantViews.some(
      (variant: any) => variant.display_price !== null,
    );
    if (!hasDisplayPrice) {
      throw new ApiException(
        'v2 shop 상품을 찾을 수 없습니다',
        404,
        'V2_SHOP_PRODUCT_NOT_FOUND',
      );
    }

    const defaultVariant =
      variantViews.find((variant: any) => variant.availability.sellable) ||
      variantViews[0] ||
      null;

    let preview: any = null;
    if (defaultVariant) {
      try {
        const quote = await this.buildPriceQuote({
          lines: [
            {
              variant_id: defaultVariant.id,
              quantity: 1,
            },
          ],
          campaign_id: campaignId,
          channel,
        });
        preview = {
          quote_reference: quote.quote_reference,
          evaluated_at: quote.evaluated_at,
          line: quote.lines?.[0] ?? null,
          summary: quote.summary,
          applied_promotions: quote.applied_promotions,
          coupon: quote.coupon,
        };
      } catch {
        preview = null;
      }
    }

    const primaryMedia = this.pickPrimaryShopMedia(media);
    const productAvailability = defaultVariant
      ? defaultVariant.availability
      : {
          sellable: false,
          reason: 'NO_ACTIVE_VARIANT',
          available_quantity: null,
        };

    return {
      product: {
        ...product,
        thumbnail_url: primaryMedia?.public_url ?? null,
        primary_variant_id: defaultVariant?.id ?? null,
        primary_variant_title: defaultVariant?.title ?? null,
        availability: productAvailability,
      },
      variants: variantViews,
      media,
      pricing_context: {
        campaign_id: campaignId,
        channel,
        evaluated_at: evaluatedAt,
        preview,
      },
      purchase_constraints: defaultVariant
        ? {
            ...defaultVariant.purchase_constraints,
            sold_out: !defaultVariant.availability.sellable,
          }
        : {
            min_quantity: 1,
            max_quantity: null,
            channel_scope: [],
            sold_out: true,
          },
    };
  }

  async getShopPricePreview(input: GetV2ShopPricePreviewInput): Promise<any> {
    const variantId = this.normalizeRequiredText(
      input.variant_id,
      'variant_id는 필수입니다',
    );
    const quantity = input.quantity ?? 1;
    this.assertPositiveInteger(quantity, 'quantity');

    const quote = await this.buildPriceQuote({
      lines: [{ variant_id: variantId, quantity }],
      campaign_id: this.normalizeOptionalText(input.campaign_id),
      channel: this.normalizeOptionalText(input.channel),
      coupon_code: this.normalizeOptionalText(input.coupon_code),
      user_id: this.normalizeOptionalText(input.user_id),
      shipping_amount: this.normalizeOptionalInteger(
        input.shipping_amount,
        'shipping_amount',
      ),
    });

    return {
      quote_reference: quote.quote_reference,
      evaluated_at: quote.evaluated_at,
      variant_id: variantId,
      quantity,
      line: quote.lines?.[0] ?? null,
      summary: quote.summary,
      applied_promotions: quote.applied_promotions,
      coupon: quote.coupon,
    };
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
    const fulfillmentType = input.fulfillment_type ?? null;
    if (productKind === 'STANDARD') {
      if (!fulfillmentType) {
        throw new ApiException(
          'STANDARD 상품은 fulfillment_type이 필수입니다',
          400,
          'VALIDATION_ERROR',
        );
      }
      this.assertFulfillmentType(fulfillmentType);
    }
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
        fulfillment_type: productKind === 'STANDARD' ? fulfillmentType : null,
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
    let nextProductKind = current.product_kind as V2ProductKind;
    let nextFulfillmentType = (current.fulfillment_type as V2FulfillmentType | null) ?? null;

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
      nextProductKind = input.product_kind;
    }
    if (input.fulfillment_type !== undefined) {
      if (input.fulfillment_type === null) {
        updateData.fulfillment_type = null;
        nextFulfillmentType = null;
      } else {
        this.assertFulfillmentType(input.fulfillment_type);
        updateData.fulfillment_type = input.fulfillment_type;
        nextFulfillmentType = input.fulfillment_type;
      }
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

    if (nextProductKind === 'STANDARD') {
      if (!nextFulfillmentType) {
        throw new ApiException(
          'STANDARD 상품은 fulfillment_type이 필수입니다',
          400,
          'VALIDATION_ERROR',
        );
      }

      const variants = await this.getVariants(productId);
      const mismatchedVariants = variants.filter(
        (variant) => variant.fulfillment_type !== nextFulfillmentType,
      );
      if (mismatchedVariants.length > 0) {
        throw new ApiException(
          '현재 옵션의 fulfillment_type이 상품 fulfillment_type과 일치하지 않습니다',
          400,
          'VALIDATION_ERROR',
        );
      }

      updateData.fulfillment_type = nextFulfillmentType;
    }

    if (nextProductKind === 'BUNDLE') {
      updateData.fulfillment_type = null;
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
    const product = await this.getProductById(productId);

    const sku = this.normalizeRequiredText(input.sku, 'sku는 필수입니다');
    const title = this.normalizeRequiredText(input.title, 'variant title은 필수입니다');
    const inputFulfillmentType = input.fulfillment_type;
    let fulfillmentType = inputFulfillmentType;
    if (product.product_kind === 'STANDARD') {
      const lockedFulfillmentType =
        (product.fulfillment_type as V2FulfillmentType | null) ?? null;
      if (lockedFulfillmentType) {
        if (inputFulfillmentType && inputFulfillmentType !== lockedFulfillmentType) {
          throw new ApiException(
            'STANDARD 상품의 옵션 fulfillment_type은 상품 설정과 같아야 합니다',
            400,
            'VALIDATION_ERROR',
          );
        }
        fulfillmentType = lockedFulfillmentType;
      } else {
        if (!inputFulfillmentType) {
          throw new ApiException(
            'fulfillment_type은 필수입니다',
            400,
            'VALIDATION_ERROR',
          );
        }
        fulfillmentType = inputFulfillmentType;
        const { error: productUpdateError } = await this.supabase
          .from('v2_products')
          .update({ fulfillment_type: inputFulfillmentType })
          .eq('id', productId);
        if (productUpdateError) {
          throw new ApiException(
            '상품 fulfillment_type 동기화 실패',
            500,
            'V2_PRODUCT_UPDATE_FAILED',
          );
        }
      }
    }
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
    const product = await this.getProductById(current.product_id as string);
    const updateData: Record<string, unknown> = {};

    let nextFulfillmentType = current.fulfillment_type as V2FulfillmentType;
    if (product.product_kind === 'STANDARD') {
      const lockedFulfillmentType =
        (product.fulfillment_type as V2FulfillmentType | null) ??
        (current.fulfillment_type as V2FulfillmentType);
      if (input.fulfillment_type !== undefined && input.fulfillment_type !== lockedFulfillmentType) {
        throw new ApiException(
          'STANDARD 상품의 옵션 fulfillment_type은 상품 설정과 같아야 합니다',
          400,
          'VALIDATION_ERROR',
        );
      }
      nextFulfillmentType = lockedFulfillmentType;
      if (current.fulfillment_type !== lockedFulfillmentType) {
        updateData.fulfillment_type = lockedFulfillmentType;
      }
      if (!product.fulfillment_type) {
        const { error: productUpdateError } = await this.supabase
          .from('v2_products')
          .update({ fulfillment_type: lockedFulfillmentType })
          .eq('id', product.id);
        if (productUpdateError) {
          throw new ApiException(
            '상품 fulfillment_type 동기화 실패',
            500,
            'V2_PRODUCT_UPDATE_FAILED',
          );
        }
      }
    } else if (input.fulfillment_type !== undefined) {
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

  async getMediaAssets(input: GetMediaAssetsInput = {}): Promise<any[]> {
    if (input.kind) {
      this.assertMediaAssetKind(input.kind);
    }
    if (input.status) {
      this.assertMediaAssetStatus(input.status);
    }

    let query = this.supabase
      .from('media_assets')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (input.kind) {
      query = query.eq('asset_kind', input.kind);
    }
    if (input.status) {
      query = query.eq('status', input.status);
    }
    if (input.search?.trim()) {
      const normalized = input.search.trim();
      query = query.or(
        `file_name.ilike.%${normalized}%,storage_path.ilike.%${normalized}%`,
      );
    }

    const { data, error } = await query.limit(300);
    if (error) {
      throw new ApiException(
        'media asset 조회 실패',
        500,
        'MEDIA_ASSET_FETCH_FAILED',
      );
    }

    const assets = data || [];
    if (assets.length === 0) {
      return [];
    }

    const referenceSummaryByAssetId = await this.getMediaAssetReferenceSummaryMap(
      assets.map((asset) => asset.id),
    );

    return assets.map((asset) => ({
      ...asset,
      reference_summary: referenceSummaryByAssetId.get(asset.id) ?? {
        product_media_count: 0,
        digital_asset_count: 0,
        campaign_banner_count: 0,
        project_cover_count: 0,
        total_reference_count: 0,
        is_orphan: true,
      },
    }));
  }

  async prepareMediaAssetUpload(input: PrepareMediaAssetUploadInput): Promise<any> {
    const fileName = this.normalizeRequiredText(input.file_name, 'file_name은 필수입니다');
    const mimeType = this.normalizeRequiredText(input.mime_type, 'mime_type은 필수입니다');
    const fileSize = input.file_size;
    this.validateMediaAssetUploadFile({
      originalname: fileName,
      mimetype: mimeType,
      size: fileSize as number,
    });

    const inferredKind = this.inferMediaAssetKind(mimeType, fileName);
    const assetKind = (input.asset_kind as V2MediaAssetKind | undefined) ?? inferredKind;
    this.assertMediaAssetKind(assetKind);
    const status = (input.status as V2MediaAssetStatus | undefined) ?? 'ACTIVE';
    this.assertMediaAssetStatus(status);

    const r2Key = this.generateMediaAssetR2Key(assetKind, fileName);
    const upload = await createPresignedUploadUrlToR2({
      key: r2Key,
      contentType: mimeType,
    });

    return {
      asset_kind: assetKind,
      status,
      storage_provider: 'R2',
      storage_bucket: process.env.R2_BUCKET_NAME || null,
      storage_path: r2Key,
      public_url: buildR2PublicUrl(r2Key),
      file_name: fileName,
      mime_type: mimeType,
      file_size: fileSize,
      upload_url: upload.uploadUrl,
      upload_method: 'PUT',
      upload_headers: {
        'Content-Type': mimeType,
      },
      expires_in_seconds: upload.expiresInSeconds,
      expires_at: upload.expiresAt,
    };
  }

  async completeMediaAssetUpload(input: CompleteMediaAssetUploadInput): Promise<any> {
    const rawStoragePath = this.normalizeRequiredText(
      input.storage_path,
      'storage_path는 필수입니다',
    );
    const storagePath = this.normalizeV2R2StoragePath(rawStoragePath);
    const fileName =
      this.normalizeOptionalText(input.file_name) ||
      this.extractFileNameFromStoragePath(storagePath);
    const status = (input.status as V2MediaAssetStatus | undefined) ?? 'ACTIVE';
    this.assertMediaAssetStatus(status);

    let objectMetadata: {
      contentType: string | null;
      contentLength: number | null;
      eTag: string | null;
    };

    try {
      objectMetadata = await getR2ObjectMetadata(storagePath);
    } catch {
      throw new ApiException(
        'R2에서 업로드된 파일을 확인할 수 없습니다',
        400,
        'UPLOADED_FILE_NOT_FOUND',
      );
    }

    const mimeType =
      this.normalizeOptionalText(input.mime_type) || objectMetadata.contentType;
    if (!mimeType) {
      throw new ApiException('mime_type은 필수입니다', 400, 'VALIDATION_ERROR');
    }

    const fileSize = input.file_size ?? objectMetadata.contentLength;
    this.assertPositiveInteger(fileSize ?? undefined, 'file_size');

    if (
      typeof input.file_size === 'number' &&
      typeof objectMetadata.contentLength === 'number' &&
      input.file_size !== objectMetadata.contentLength
    ) {
      throw new ApiException(
        '업로드된 파일 크기가 요청 값과 일치하지 않습니다',
        400,
        'UPLOAD_FILE_SIZE_MISMATCH',
      );
    }

    const inferredKind = this.inferMediaAssetKind(mimeType, storagePath);
    const assetKind = (input.asset_kind as V2MediaAssetKind | undefined) ?? inferredKind;
    this.assertMediaAssetKind(assetKind);

    const checksum =
      this.normalizeOptionalText(input.checksum) ??
      this.normalizeOptionalText(objectMetadata.eTag)?.replace(/^"+|"+$/g, '');

    return this.createMediaAsset({
      asset_kind: assetKind,
      status,
      storage_provider: 'R2',
      storage_bucket: process.env.R2_BUCKET_NAME || null,
      storage_path: storagePath,
      public_url: buildR2PublicUrl(storagePath),
      file_name: fileName,
      mime_type: mimeType,
      file_size: fileSize ?? null,
      checksum,
      metadata: input.metadata ?? {},
    });
  }

  async initiateMultipartMediaAssetUpload(
    input: InitiateMultipartMediaAssetUploadInput,
  ): Promise<any> {
    const fileName = this.normalizeRequiredText(input.file_name, 'file_name은 필수입니다');
    const mimeType = this.normalizeRequiredText(input.mime_type, 'mime_type은 필수입니다');
    const fileSize = input.file_size;
    this.validateMediaAssetUploadFile({
      originalname: fileName,
      mimetype: mimeType,
      size: fileSize as number,
    });

    const inferredKind = this.inferMediaAssetKind(mimeType, fileName);
    const assetKind = (input.asset_kind as V2MediaAssetKind | undefined) ?? inferredKind;
    this.assertMediaAssetKind(assetKind);
    const assetStatus = (input.status as V2MediaAssetStatus | undefined) ?? 'ACTIVE';
    this.assertMediaAssetStatus(assetStatus);

    const storagePath = this.generateMediaAssetR2Key(assetKind, fileName);
    const { uploadId } = await createMultipartUploadToR2({
      key: storagePath,
      contentType: mimeType,
    });

    const partSize = this.getMultipartUploadPartSize(fileSize as number);
    const totalParts = Math.ceil((fileSize as number) / partSize);
    const expiresAt = this.getMultipartSessionExpiresAt();

    const { data, error } = await this.supabase
      .from('media_asset_upload_sessions')
      .insert({
        upload_id: uploadId,
        storage_path: storagePath,
        file_name: fileName,
        mime_type: mimeType,
        file_size: fileSize,
        asset_kind: assetKind,
        asset_status: assetStatus,
        part_size: partSize,
        total_parts: totalParts,
        status: 'INITIATED',
        uploaded_parts_json: [],
        metadata: input.metadata ?? {},
        expires_at: expiresAt,
      })
      .select('*')
      .single();

    if (error || !data) {
      try {
        await abortMultipartUploadToR2({
          key: storagePath,
          uploadId,
        });
      } catch {
        // If DB insert fails we still prefer surfacing the original error.
      }
      throw new ApiException(
        `multipart 업로드 세션 생성 실패${this.formatSupabaseErrorSuffix(error)}`,
        500,
        'MEDIA_ASSET_MULTIPART_SESSION_CREATE_FAILED',
      );
    }

    return {
      session_id: data.id,
      asset_kind: data.asset_kind,
      status: data.asset_status,
      storage_provider: 'R2',
      storage_bucket: process.env.R2_BUCKET_NAME || null,
      storage_path: data.storage_path,
      public_url: buildR2PublicUrl(data.storage_path),
      file_name: data.file_name,
      mime_type: data.mime_type,
      file_size: data.file_size,
      part_size: data.part_size,
      total_parts: data.total_parts,
      expires_at: data.expires_at,
    };
  }

  async signMultipartMediaAssetUploadParts(
    input: SignMultipartMediaAssetUploadPartsInput,
  ): Promise<any> {
    const sessionId = this.normalizeRequiredText(
      input.session_id,
      'session_id는 필수입니다',
    );
    const session = await this.getMediaAssetUploadSessionById(sessionId);
    this.assertMultipartSessionAvailable(session);
    if (session.status === 'COMPLETED' || session.status === 'COMPLETING') {
      throw new ApiException(
        '이미 마무리 중이거나 완료된 multipart 업로드 세션입니다',
        400,
        'MEDIA_ASSET_MULTIPART_SESSION_FINALIZED',
      );
    }

    const partNumbers = this.normalizeMultipartPartNumbers(
      input.part_numbers,
      session.total_parts,
    );

    const signedParts = await Promise.all(
      partNumbers.map(async (partNumber) => {
        const signed = await createPresignedMultipartUploadPartUrlToR2({
          key: session.storage_path,
          uploadId: session.upload_id,
          partNumber,
        });

        return {
          part_number: partNumber,
          upload_url: signed.uploadUrl,
          expires_in_seconds: signed.expiresInSeconds,
          expires_at: signed.expiresAt,
        };
      }),
    );

    if (session.status === 'INITIATED') {
      await this.updateMediaAssetUploadSession(session.id, {
        status: 'UPLOADING',
      });
    }

    return {
      session_id: session.id,
      part_size: session.part_size,
      total_parts: session.total_parts,
      parts: signedParts,
    };
  }

  async completeMultipartMediaAssetUpload(
    input: CompleteMultipartMediaAssetUploadInput,
  ): Promise<any> {
    const sessionId = this.normalizeRequiredText(
      input.session_id,
      'session_id는 필수입니다',
    );
    const session = await this.getMediaAssetUploadSessionById(sessionId);
    this.assertMultipartSessionAvailable(session);

    if (session.status === 'COMPLETED' && session.media_asset_id) {
      return this.getMediaAssetById(session.media_asset_id);
    }

    const parts = this.normalizeMultipartCompletedParts(
      input.parts,
      session.total_parts,
    );

    await this.updateMediaAssetUploadSession(session.id, {
      status: 'COMPLETING',
      uploaded_parts_json: parts,
    });

    try {
      await completeMultipartUploadToR2({
        key: session.storage_path,
        uploadId: session.upload_id,
        parts: parts.map((part) => ({
          partNumber: part.part_number,
          eTag: part.etag,
        })),
      });

      const asset = await this.completeMediaAssetUpload({
        storage_path: session.storage_path,
        file_name: session.file_name,
        mime_type: session.mime_type,
        file_size: session.file_size,
        asset_kind: session.asset_kind,
        status: session.asset_status,
        metadata: session.metadata ?? {},
      });

      await this.updateMediaAssetUploadSession(session.id, {
        status: 'COMPLETED',
        media_asset_id: asset.id,
        completed_at: new Date().toISOString(),
      });

      return asset;
    } catch (error) {
      await this.updateMediaAssetUploadSession(session.id, {
        status: 'FAILED',
        uploaded_parts_json: parts,
      });
      throw error;
    }
  }

  async abortMultipartMediaAssetUpload(sessionId: string | undefined): Promise<any> {
    const normalizedSessionId = this.normalizeRequiredText(
      sessionId,
      'session_id는 필수입니다',
    );
    const session = await this.getMediaAssetUploadSessionById(normalizedSessionId);

    if (session.status === 'ABORTED') {
      return session;
    }

    if (session.status === 'COMPLETED') {
      return session;
    }

    try {
      await abortMultipartUploadToR2({
        key: session.storage_path,
        uploadId: session.upload_id,
      });
    } catch {
      // R2 already cleaned up or invalid upload ID can be treated as aborted.
    }

    return this.updateMediaAssetUploadSession(session.id, {
      status: 'ABORTED',
      aborted_at: new Date().toISOString(),
    });
  }

  private async createMediaAsset(input: CreateMediaAssetInput): Promise<any> {
    const rawStoragePath = this.normalizeRequiredText(
      input.storage_path,
      'storage_path는 필수입니다',
    );
    const mimeType = this.normalizeOptionalText(input.mime_type) || null;
    const storageProvider =
      this.normalizeOptionalText(input.storage_provider)?.toUpperCase() || 'R2';
    const storagePath =
      storageProvider === 'R2'
        ? this.normalizeV2R2StoragePath(rawStoragePath)
        : rawStoragePath;
    const assetKind =
      input.asset_kind ?? this.inferMediaAssetKind(mimeType, storagePath);
    this.assertMediaAssetKind(assetKind);

    const status = input.status ?? 'ACTIVE';
    this.assertMediaAssetStatus(status);

    if (input.file_size !== undefined && input.file_size !== null) {
      this.assertPositiveInteger(input.file_size, 'file_size');
    }

    const fileName =
      this.normalizeOptionalText(input.file_name) ||
      this.extractFileNameFromStoragePath(storagePath);

    const { data: existing, error: existingError } = await this.supabase
      .from('media_assets')
      .select('*')
      .eq('storage_provider', storageProvider)
      .eq('storage_path', storagePath)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingError) {
      throw new ApiException(
        'media asset 조회 실패',
        500,
        'MEDIA_ASSET_FETCH_FAILED',
      );
    }

    if (existing) {
      const patch: Record<string, unknown> = {};
      const normalizedPublicUrl = this.normalizeOptionalText(input.public_url);
      const normalizedChecksum = this.normalizeOptionalText(input.checksum);
      const normalizedBucket = this.normalizeOptionalText(input.storage_bucket);
      if (normalizedPublicUrl && !existing.public_url) {
        patch.public_url = normalizedPublicUrl;
      }
      if (existing.asset_kind === 'FILE' && assetKind !== 'FILE') {
        patch.asset_kind = assetKind;
      }
      if (fileName && !existing.file_name) {
        patch.file_name = fileName;
      }
      if (mimeType && !existing.mime_type) {
        patch.mime_type = mimeType;
      }
      if ((input.file_size ?? null) && !existing.file_size) {
        patch.file_size = input.file_size;
      }
      if (normalizedChecksum && !existing.checksum) {
        patch.checksum = normalizedChecksum;
      }
      if (normalizedBucket && !existing.storage_bucket) {
        patch.storage_bucket = normalizedBucket;
      }
      if (status === 'ACTIVE' && existing.status !== 'ACTIVE') {
        patch.status = 'ACTIVE';
      }
      if (input.metadata && Object.keys(input.metadata).length > 0) {
        patch.metadata = {
          ...(existing.metadata || {}),
          ...input.metadata,
        };
      }

      if (Object.keys(patch).length === 0) {
        return existing;
      }

      const { data: updated, error: updateError } = await this.supabase
        .from('media_assets')
        .update(patch)
        .eq('id', existing.id)
        .select('*')
        .single();

      if (updateError || !updated) {
        throw new ApiException(
          'media asset 갱신 실패',
          500,
          'MEDIA_ASSET_UPDATE_FAILED',
        );
      }

      return updated;
    }

    const { data, error } = await this.supabase
      .from('media_assets')
      .insert({
        asset_kind: assetKind,
        storage_provider: storageProvider,
        storage_bucket: this.normalizeOptionalText(input.storage_bucket),
        storage_path: storagePath,
        public_url: this.normalizeOptionalText(input.public_url),
        file_name: fileName,
        mime_type: mimeType,
        file_size: input.file_size ?? null,
        checksum: this.normalizeOptionalText(input.checksum),
        status,
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'media asset 생성 실패',
        500,
        'MEDIA_ASSET_CREATE_FAILED',
      );
    }

    return data;
  }

  async updateMediaAsset(mediaAssetId: string, input: UpdateMediaAssetInput): Promise<any> {
    const current = await this.getMediaAssetById(mediaAssetId);
    if (input.storage_path !== undefined || input.public_url !== undefined) {
      throw new ApiException(
        'storage_path/public_url은 수정할 수 없습니다. 파일 업로드를 통해 관리하세요.',
        400,
        'VALIDATION_ERROR',
      );
    }
    const updateData: Record<string, unknown> = {};

    if (input.asset_kind !== undefined) {
      this.assertMediaAssetKind(input.asset_kind);
      updateData.asset_kind = input.asset_kind;
    }
    if (input.status !== undefined) {
      this.assertMediaAssetStatus(input.status);
      updateData.status = input.status;
    }
    if (input.file_name !== undefined) {
      updateData.file_name = this.normalizeRequiredText(
        input.file_name,
        'file_name은 필수입니다',
      );
    }
    if (input.mime_type !== undefined) {
      updateData.mime_type = this.normalizeOptionalText(input.mime_type);
    }
    if (input.file_size !== undefined) {
      if (input.file_size === null) {
        updateData.file_size = null;
      } else {
        this.assertPositiveInteger(input.file_size, 'file_size');
        updateData.file_size = input.file_size;
      }
    }
    if (input.checksum !== undefined) {
      updateData.checksum = this.normalizeOptionalText(input.checksum);
    }
    if (input.storage_bucket !== undefined) {
      updateData.storage_bucket = this.normalizeOptionalText(input.storage_bucket);
    }
    if (input.metadata !== undefined) {
      updateData.metadata = input.metadata ?? {};
    }

    const nextStoragePath = (updateData.storage_path as string | undefined) ?? current.storage_path;
    const nextFileName = (updateData.file_name as string | undefined) ?? current.file_name;
    if (!nextFileName && nextStoragePath) {
      updateData.file_name = this.extractFileNameFromStoragePath(nextStoragePath);
    }

    if (Object.keys(updateData).length === 0) {
      return current;
    }

    const { data, error } = await this.supabase
      .from('media_assets')
      .update(updateData)
      .eq('id', mediaAssetId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'media asset 수정 실패',
        500,
        'MEDIA_ASSET_UPDATE_FAILED',
      );
    }

    return data;
  }

  async deleteMediaAsset(mediaAssetId: string): Promise<any> {
    const current = await this.getMediaAssetById(mediaAssetId);
    const referenceSummaryByAssetId = await this.getMediaAssetReferenceSummaryMap([
      mediaAssetId,
    ]);
    const referenceSummary = referenceSummaryByAssetId.get(mediaAssetId) ?? {
      product_media_count: 0,
      digital_asset_count: 0,
      campaign_banner_count: 0,
      project_cover_count: 0,
      total_reference_count: 0,
      is_orphan: true,
    };

    if (referenceSummary.total_reference_count > 0) {
      throw new ApiException(
        '다른 상품/디지털 에셋/캠페인 배너/프로젝트 커버에서 참조 중인 media asset은 삭제할 수 없습니다',
        400,
        'MEDIA_ASSET_IN_USE',
      );
    }

    if (
      current.storage_provider?.toUpperCase() === 'R2' &&
      this.normalizeOptionalText(current.storage_path)
    ) {
      try {
        await deleteFileFromR2(current.storage_path);
      } catch (error) {
        if (!this.isIgnorableR2MissingObjectError(error)) {
          throw new ApiException(
            'R2 파일 삭제에 실패했습니다',
            500,
            'MEDIA_ASSET_FILE_DELETE_FAILED',
          );
        }
      }
    }

    const { data, error } = await this.supabase
      .from('media_assets')
      .update({
        status: 'ARCHIVED',
        deleted_at: new Date().toISOString(),
        metadata: {
          ...(current.metadata || {}),
          removed_from_registry_at: new Date().toISOString(),
        },
      })
      .eq('id', mediaAssetId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'media asset 삭제 실패',
        500,
        'MEDIA_ASSET_DELETE_FAILED',
      );
    }

    return {
      ...data,
      reference_summary: referenceSummary,
    };
  }

  async getProductMedia(productId: string): Promise<any[]> {
    await this.ensureProductExists(productId);
    const { data, error } = await this.supabase
      .from('v2_product_media')
      .select('*, media_asset:media_assets(*)')
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
    this.assertNoInlineStorageOverride(input as Record<string, unknown>);
    const mediaType = input.media_type ?? 'IMAGE';
    const mediaRole = input.media_role ?? 'GALLERY';
    this.assertMediaType(mediaType);
    this.assertMediaRole(mediaRole);
    this.assertMediaStatus(input.status ?? 'DRAFT');
    this.assertSortOrder(input.sort_order);
    const mediaAsset = await this.resolveProductMediaAsset(mediaType, input);

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
        media_asset_id: mediaAsset.id,
        storage_path: mediaAsset.storage_path,
        public_url: mediaAsset.public_url,
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
    this.assertNoInlineStorageOverride(input as Record<string, unknown>);
    const updateData: Record<string, unknown> = {};
    let nextMediaType = current.media_type as V2MediaType;

    if (input.media_type !== undefined) {
      this.assertMediaType(input.media_type);
      updateData.media_type = input.media_type;
      nextMediaType = input.media_type;
    }
    if (input.media_role !== undefined) {
      this.assertMediaRole(input.media_role);
      updateData.media_role = input.media_role;
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
    if (input.media_asset_id !== undefined) {
      const mediaAsset = await this.resolveProductMediaAsset(nextMediaType, input);
      updateData.media_asset_id = mediaAsset.id;
      updateData.storage_path = mediaAsset.storage_path;
      updateData.public_url = mediaAsset.public_url;
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
      .select('*, media_asset:media_assets(*)')
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
    this.assertNoInlineStorageOverride(input as Record<string, unknown>);
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
    const mediaAsset = await this.resolveDigitalAssetMediaAsset(input);

    const fileName =
      this.normalizeOptionalText(input.file_name) ||
      this.normalizeOptionalText(mediaAsset.file_name) ||
      this.extractFileNameFromStoragePath(mediaAsset.storage_path);
    const storagePath = mediaAsset.storage_path as string;
    const mimeType =
      this.normalizeOptionalText(input.mime_type) ||
      this.normalizeOptionalText(mediaAsset.mime_type);
    if (!mimeType) {
      throw new ApiException(
        'mime_type은 필수입니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    const fileSize = input.file_size ?? mediaAsset.file_size;
    this.assertPositiveInteger(fileSize ?? undefined, 'file_size');

    const { data, error } = await this.supabase
      .from('v2_digital_assets')
      .insert({
        variant_id: variantId,
        asset_role: assetRole,
        media_asset_id: mediaAsset.id,
        file_name: fileName,
        storage_path: storagePath,
        mime_type: mimeType,
        file_size: fileSize,
        version_no: versionNo,
        checksum:
          this.normalizeOptionalText(input.checksum) ??
          this.normalizeOptionalText(mediaAsset.checksum),
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
    this.assertNoInlineStorageOverride(input as Record<string, unknown>);
    const updateData: Record<string, unknown> = {};
    if (
      input.media_asset_id !== undefined ||
      input.file_name !== undefined ||
      input.mime_type !== undefined ||
      input.file_size !== undefined ||
      input.checksum !== undefined
    ) {
      const mediaAsset = await this.resolveDigitalAssetMediaAsset(input, current);
      const fileName =
        this.normalizeOptionalText(input.file_name) ||
        this.normalizeOptionalText(mediaAsset.file_name) ||
        this.extractFileNameFromStoragePath(mediaAsset.storage_path);
      const mimeType =
        this.normalizeOptionalText(input.mime_type) ||
        this.normalizeOptionalText(mediaAsset.mime_type);
      if (!mimeType) {
        throw new ApiException(
          'mime_type은 필수입니다',
          400,
          'VALIDATION_ERROR',
        );
      }
      const fileSize = input.file_size ?? mediaAsset.file_size;
      this.assertPositiveInteger(fileSize ?? undefined, 'file_size');
      updateData.media_asset_id = mediaAsset.id;
      updateData.storage_path = mediaAsset.storage_path;
      updateData.file_name = fileName;
      updateData.mime_type = mimeType;
      updateData.file_size = fileSize;
      updateData.checksum =
        this.normalizeOptionalText(input.checksum) ??
        this.normalizeOptionalText(mediaAsset.checksum);
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

  async getCampaigns(filters: {
    status?: V2CampaignStatus;
    campaignType?: V2CampaignType;
  }): Promise<any[]> {
    let query = this.supabase
      .from('v2_campaigns')
      .select(
        `
        *,
        shop_banner_media_asset:media_assets(
          id,
          asset_kind,
          status,
          file_name,
          public_url
        )
      `,
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (filters.status) {
      this.assertCampaignStatus(filters.status);
      query = query.eq('status', filters.status);
    }
    if (filters.campaignType) {
      this.assertCampaignType(filters.campaignType);
      query = query.eq('campaign_type', filters.campaignType);
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiException(
        'campaign 목록 조회 실패',
        500,
        'V2_CAMPAIGNS_FETCH_FAILED',
      );
    }

    return data || [];
  }

  async getCampaignById(campaignId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_campaigns')
      .select(
        `
        *,
        shop_banner_media_asset:media_assets(
          id,
          asset_kind,
          status,
          file_name,
          public_url
        )
      `,
      )
      .eq('id', campaignId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException('campaign 조회 실패', 500, 'V2_CAMPAIGN_FETCH_FAILED');
    }
    if (!data) {
      throw new ApiException(
        'campaign을 찾을 수 없습니다',
        404,
        'V2_CAMPAIGN_NOT_FOUND',
      );
    }

    return data;
  }

  async createCampaign(input: CreateV2CampaignInput): Promise<any> {
    const code = this.normalizeRequiredText(input.code, 'campaign code는 필수입니다');
    const name = this.normalizeRequiredText(input.name, 'campaign name은 필수입니다');
    const campaignType = input.campaign_type ?? 'EVENT';
    const status = input.status ?? 'DRAFT';
    this.assertCampaignType(campaignType);
    this.assertCampaignStatus(status);

    const startsAt = this.normalizeOptionalTimestamp(input.starts_at, 'starts_at');
    const endsAt = this.normalizeOptionalTimestamp(input.ends_at, 'ends_at');
    this.assertDateRange(startsAt, endsAt, 'campaign 기간');
    const shopBannerMediaAssetId = await this.resolveCampaignBannerMediaAssetId(
      input.shop_banner_media_asset_id,
    );

    await this.assertCampaignCodeAvailable(code);

    const { data, error } = await this.supabase
      .from('v2_campaigns')
      .insert({
        code,
        name,
        description: this.normalizeOptionalText(input.description),
        campaign_type: campaignType,
        status,
        starts_at: startsAt,
        ends_at: endsAt,
        shop_banner_media_asset_id: shopBannerMediaAssetId,
        shop_banner_alt_text: shopBannerMediaAssetId
          ? this.normalizeOptionalText(input.shop_banner_alt_text)
          : null,
        channel_scope_json: this.normalizeOptionalArrayJson(input.channel_scope_json),
        purchase_limit_json: this.normalizeOptionalObjectJson(
          input.purchase_limit_json,
        ),
        source_type: this.normalizeOptionalText(input.source_type),
        source_id: this.normalizeOptionalText(input.source_id),
        source_snapshot_json: this.normalizeOptionalObjectJson(
          input.source_snapshot_json,
        ),
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'campaign 생성 실패',
        500,
        'V2_CAMPAIGN_CREATE_FAILED',
      );
    }

    return data;
  }

  async updateCampaign(campaignId: string, input: UpdateV2CampaignInput): Promise<any> {
    const current = await this.getCampaignById(campaignId);
    const updateData: Record<string, unknown> = {};

    if (input.code !== undefined) {
      const code = this.normalizeRequiredText(input.code, 'campaign code는 필수입니다');
      await this.assertCampaignCodeAvailable(code, campaignId);
      updateData.code = code;
    }
    if (input.name !== undefined) {
      updateData.name = this.normalizeRequiredText(
        input.name,
        'campaign name은 필수입니다',
      );
    }
    if (input.description !== undefined) {
      updateData.description = this.normalizeOptionalText(input.description);
    }
    if (input.campaign_type !== undefined) {
      this.assertCampaignType(input.campaign_type);
      updateData.campaign_type = input.campaign_type;
    }
    if (input.status !== undefined) {
      this.assertCampaignStatus(input.status);
      this.assertCampaignStatusTransition(
        current.status as V2CampaignStatus,
        input.status,
      );
      updateData.status = input.status;
    }
    if (input.starts_at !== undefined) {
      updateData.starts_at = this.normalizeOptionalTimestamp(
        input.starts_at,
        'starts_at',
      );
    }
    if (input.ends_at !== undefined) {
      updateData.ends_at = this.normalizeOptionalTimestamp(input.ends_at, 'ends_at');
    }
    if (input.shop_banner_media_asset_id !== undefined) {
      updateData.shop_banner_media_asset_id =
        await this.resolveCampaignBannerMediaAssetId(
          input.shop_banner_media_asset_id,
        );
    }
    if (input.shop_banner_alt_text !== undefined) {
      updateData.shop_banner_alt_text = this.normalizeOptionalText(
        input.shop_banner_alt_text,
      );
    }
    if (
      input.shop_banner_media_asset_id !== undefined &&
      updateData.shop_banner_media_asset_id === null &&
      input.shop_banner_alt_text === undefined
    ) {
      updateData.shop_banner_alt_text = null;
    }
    if (input.channel_scope_json !== undefined) {
      updateData.channel_scope_json = this.normalizeOptionalArrayJson(
        input.channel_scope_json,
      );
    }
    if (input.purchase_limit_json !== undefined) {
      updateData.purchase_limit_json = this.normalizeOptionalObjectJson(
        input.purchase_limit_json,
      );
    }
    if (input.source_type !== undefined) {
      updateData.source_type = this.normalizeOptionalText(input.source_type);
    }
    if (input.source_id !== undefined) {
      updateData.source_id = this.normalizeOptionalText(input.source_id);
    }
    if (input.source_snapshot_json !== undefined) {
      updateData.source_snapshot_json = this.normalizeOptionalObjectJson(
        input.source_snapshot_json,
      );
    }
    if (input.metadata !== undefined) {
      updateData.metadata = input.metadata ?? {};
    }

    const nextStartsAt =
      (updateData.starts_at as string | null | undefined) ??
      (current.starts_at as string | null);
    const nextEndsAt =
      (updateData.ends_at as string | null | undefined) ??
      (current.ends_at as string | null);
    this.assertDateRange(nextStartsAt, nextEndsAt, 'campaign 기간');

    const nextCampaignType =
      (updateData.campaign_type as V2CampaignType | undefined) ??
      (current.campaign_type as V2CampaignType);
    const nextCampaignStatus =
      (updateData.status as V2CampaignStatus | undefined) ??
      (current.status as V2CampaignStatus);
    if (nextCampaignType === 'ALWAYS_ON' && nextCampaignStatus === 'ACTIVE') {
      const projectIds = await this.resolveCampaignIncludedProjectIds(campaignId);
      if (projectIds.length === 0) {
        throw new ApiException(
          '상시 운영 캠페인을 ACTIVE로 전환하려면 대상 프로젝트를 1개 이상 포함해야 합니다',
          400,
          'V2_ALWAYS_ON_CAMPAIGN_TARGET_REQUIRED',
        );
      }
      await this.assertNoActiveAlwaysOnCampaignProjectConflicts({
        campaignId,
        projectIds,
      });
    }

    if (Object.keys(updateData).length === 0) {
      return current;
    }

    const { data, error } = await this.supabase
      .from('v2_campaigns')
      .update(updateData)
      .eq('id', campaignId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'campaign 수정 실패',
        500,
        'V2_CAMPAIGN_UPDATE_FAILED',
      );
    }

    if (input.starts_at !== undefined || input.ends_at !== undefined) {
      const { error: syncError } = await this.supabase
        .from('v2_price_lists')
        .update({
          starts_at: data.starts_at ?? null,
          ends_at: data.ends_at ?? null,
        })
        .eq('campaign_id', campaignId)
        .is('deleted_at', null);

      if (syncError) {
        throw new ApiException(
          'campaign 연동 price list 기간 동기화 실패',
          500,
          'V2_CAMPAIGN_PRICE_LIST_SYNC_FAILED',
        );
      }
    }

    return data;
  }

  async activateCampaign(campaignId: string): Promise<any> {
    const current = await this.getCampaignById(campaignId);
    this.assertCampaignStatusTransition(current.status as V2CampaignStatus, 'ACTIVE');
    const nowIso = new Date().toISOString();

    if ((current.campaign_type as V2CampaignType) === 'ALWAYS_ON') {
      const projectIds = await this.resolveCampaignIncludedProjectIds(campaignId);
      if (projectIds.length === 0) {
        throw new ApiException(
          '상시 운영 캠페인을 ACTIVE로 전환하려면 대상 프로젝트를 1개 이상 포함해야 합니다',
          400,
          'V2_ALWAYS_ON_CAMPAIGN_TARGET_REQUIRED',
        );
      }
      await this.assertNoActiveAlwaysOnCampaignProjectConflicts({
        campaignId,
        projectIds,
      });
    }

    const endsAt = this.normalizeOptionalTimestamp(
      current.ends_at as string | null | undefined,
      'ends_at',
    );
    const shouldClearEndsAt =
      endsAt !== null && new Date(endsAt).getTime() <= new Date(nowIso).getTime();

    const { data, error } = await this.supabase
      .from('v2_campaigns')
      .update({
        status: 'ACTIVE',
        starts_at: current.starts_at ?? nowIso,
        ends_at: shouldClearEndsAt ? null : endsAt,
      })
      .eq('id', campaignId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'campaign activate 실패',
        500,
        'V2_CAMPAIGN_ACTIVATE_FAILED',
      );
    }

    return data;
  }

  async suspendCampaign(campaignId: string): Promise<any> {
    const current = await this.getCampaignById(campaignId);
    this.assertCampaignStatusTransition(
      current.status as V2CampaignStatus,
      'SUSPENDED',
    );

    const { data, error } = await this.supabase
      .from('v2_campaigns')
      .update({
        status: 'SUSPENDED',
      })
      .eq('id', campaignId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'campaign suspend 실패',
        500,
        'V2_CAMPAIGN_SUSPEND_FAILED',
      );
    }

    return data;
  }

  async closeCampaign(campaignId: string): Promise<any> {
    const current = await this.getCampaignById(campaignId);
    this.assertCampaignStatusTransition(current.status as V2CampaignStatus, 'CLOSED');

    const now = new Date().toISOString();
    const { data, error } = await this.supabase
      .from('v2_campaigns')
      .update({
        status: 'CLOSED',
        ends_at: current.ends_at ?? now,
      })
      .eq('id', campaignId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException('campaign close 실패', 500, 'V2_CAMPAIGN_CLOSE_FAILED');
    }

    return data;
  }

  async getCampaignTargets(campaignId: string): Promise<any[]> {
    await this.getCampaignById(campaignId);
    const { data, error } = await this.supabase
      .from('v2_campaign_targets')
      .select('*')
      .eq('campaign_id', campaignId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true });

    if (error) {
      throw new ApiException(
        'campaign target 목록 조회 실패',
        500,
        'V2_CAMPAIGN_TARGETS_FETCH_FAILED',
      );
    }

    return data || [];
  }

  private async resolveProjectIdsByCampaignTarget(
    targetType: V2CampaignTargetType,
    targetId: string,
  ): Promise<string[]> {
    if (targetType === 'PROJECT') {
      return [targetId];
    }

    if (targetType === 'PRODUCT') {
      const { data, error } = await this.supabase
        .from('v2_products')
        .select('project_id')
        .eq('id', targetId)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) {
        throw new ApiException(
          'campaign target 프로젝트 매핑 실패',
          500,
          'V2_CAMPAIGN_TARGET_PROJECT_RESOLVE_FAILED',
        );
      }
      const projectId = this.normalizeOptionalText(data?.project_id as string | null | undefined);
      return projectId ? [projectId] : [];
    }

    if (targetType === 'VARIANT') {
      const { data, error } = await this.supabase
        .from('v2_product_variants')
        .select('product_id')
        .eq('id', targetId)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) {
        throw new ApiException(
          'campaign variant target 프로젝트 매핑 실패',
          500,
          'V2_CAMPAIGN_TARGET_PROJECT_RESOLVE_FAILED',
        );
      }
      const productId = this.normalizeOptionalText(data?.product_id as string | null | undefined);
      if (!productId) {
        return [];
      }
      return this.resolveProjectIdsByCampaignTarget('PRODUCT', productId);
    }

    if (targetType === 'BUNDLE_DEFINITION') {
      const { data, error } = await this.supabase
        .from('v2_bundle_definitions')
        .select('bundle_product_id')
        .eq('id', targetId)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) {
        throw new ApiException(
          'campaign bundle target 프로젝트 매핑 실패',
          500,
          'V2_CAMPAIGN_TARGET_PROJECT_RESOLVE_FAILED',
        );
      }
      const bundleProductId = this.normalizeOptionalText(
        data?.bundle_product_id as string | null | undefined,
      );
      if (!bundleProductId) {
        return [];
      }
      return this.resolveProjectIdsByCampaignTarget('PRODUCT', bundleProductId);
    }

    return [];
  }

  private async resolveCampaignIncludedProjectIds(campaignId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('v2_campaign_targets')
      .select('target_type,target_id,is_excluded')
      .eq('campaign_id', campaignId)
      .is('deleted_at', null);
    if (error) {
      throw new ApiException(
        'campaign 대상 프로젝트 조회 실패',
        500,
        'V2_CAMPAIGN_TARGETS_FETCH_FAILED',
      );
    }

    const projectIds = new Set<string>();
    for (const row of data || []) {
      if (row.is_excluded) {
        continue;
      }
      const targetType = row.target_type as V2CampaignTargetType | null;
      const targetId = this.normalizeOptionalText(row.target_id as string | null | undefined);
      if (!targetType || !targetId) {
        continue;
      }
      const resolvedProjectIds = await this.resolveProjectIdsByCampaignTarget(
        targetType,
        targetId,
      );
      resolvedProjectIds.forEach((projectId) => {
        if (projectId) {
          projectIds.add(projectId);
        }
      });
    }

    if (projectIds.size === 0) {
      const campaign = await this.getCampaignById(campaignId);
      const sourceType = this.normalizeOptionalText(
        campaign.source_type as string | null | undefined,
      );
      const sourceId = this.normalizeOptionalText(
        campaign.source_id as string | null | undefined,
      );

      if (
        sourceId &&
        (!sourceType || sourceType.toUpperCase() === 'PROJECT')
      ) {
        const { data: sourceProject, error: sourceProjectError } = await this.supabase
          .from('v2_projects')
          .select('id')
          .eq('id', sourceId)
          .is('deleted_at', null)
          .maybeSingle();
        if (sourceProjectError) {
          throw new ApiException(
            'campaign source 프로젝트 매핑 실패',
            500,
            'V2_CAMPAIGN_SOURCE_PROJECT_RESOLVE_FAILED',
          );
        }
        const sourceProjectId = this.normalizeOptionalText(
          sourceProject?.id as string | null | undefined,
        );
        if (sourceProjectId) {
          projectIds.add(sourceProjectId);
        }
      }
    }

    return Array.from(projectIds);
  }

  private async assertNoActiveAlwaysOnCampaignProjectConflicts(params: {
    campaignId: string;
    projectIds: string[];
  }): Promise<void> {
    const targetProjectIds = Array.from(
      new Set((params.projectIds || []).filter((projectId) => !!projectId)),
    );
    if (targetProjectIds.length === 0) {
      return;
    }

    const { data, error } = await this.supabase
      .from('v2_campaigns')
      .select('id,name')
      .eq('campaign_type', 'ALWAYS_ON')
      .eq('status', 'ACTIVE')
      .is('deleted_at', null)
      .neq('id', params.campaignId);
    if (error) {
      throw new ApiException(
        '상시 운영 캠페인 충돌 검사 실패',
        500,
        'V2_ALWAYS_ON_CAMPAIGN_CONFLICT_CHECK_FAILED',
      );
    }

    const conflictedCampaignNames: string[] = [];
    for (const candidate of data || []) {
      const candidateProjectIds = await this.resolveCampaignIncludedProjectIds(
        candidate.id as string,
      );
      const hasConflict = candidateProjectIds.some((projectId) =>
        targetProjectIds.includes(projectId),
      );
      if (hasConflict) {
        conflictedCampaignNames.push(
          this.normalizeOptionalText(candidate.name as string | null | undefined) ||
            (candidate.id as string),
        );
      }
    }

    if (conflictedCampaignNames.length > 0) {
      throw new ApiException(
        `같은 프로젝트에 ACTIVE 상시 운영 캠페인이 이미 있습니다: ${conflictedCampaignNames.join(', ')}`,
        409,
        'V2_ALWAYS_ON_CAMPAIGN_CONFLICT',
      );
    }
  }

  async createCampaignTarget(
    campaignId: string,
    input: CreateV2CampaignTargetInput,
  ): Promise<any> {
    const campaign = await this.getCampaignById(campaignId);
    const targetType = input.target_type;
    if (!targetType) {
      throw new ApiException(
        'target_type은 필수입니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    this.assertCampaignTargetType(targetType);

    const targetId = this.normalizeRequiredText(
      input.target_id,
      'target_id는 필수입니다',
    );
    await this.ensureCampaignTargetEntityExists(targetType, targetId);

    if (
      campaign.campaign_type === 'ALWAYS_ON' &&
      campaign.status === 'ACTIVE' &&
      !(input.is_excluded ?? false)
    ) {
      const projectIds = await this.resolveProjectIdsByCampaignTarget(targetType, targetId);
      await this.assertNoActiveAlwaysOnCampaignProjectConflicts({
        campaignId,
        projectIds,
      });
    }

    if (input.sort_order !== undefined) {
      this.assertSortOrder(input.sort_order);
    }

    const { data, error } = await this.supabase
      .from('v2_campaign_targets')
      .insert({
        campaign_id: campaignId,
        target_type: targetType,
        target_id: targetId,
        sort_order: input.sort_order ?? 0,
        is_excluded: input.is_excluded ?? false,
        source_type: this.normalizeOptionalText(input.source_type),
        source_id: this.normalizeOptionalText(input.source_id),
        source_snapshot_json: this.normalizeOptionalObjectJson(
          input.source_snapshot_json,
        ),
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'campaign target 생성 실패',
        500,
        'V2_CAMPAIGN_TARGET_CREATE_FAILED',
      );
    }

    return data;
  }

  async updateCampaignTarget(
    targetId: string,
    input: UpdateV2CampaignTargetInput,
  ): Promise<any> {
    const current = await this.getCampaignTargetById(targetId);
    const campaign = await this.getCampaignById(current.campaign_id as string);
    const updateData: Record<string, unknown> = {};
    let nextTargetType = current.target_type as V2CampaignTargetType;
    let nextTargetId = current.target_id as string;

    if (input.target_type !== undefined) {
      this.assertCampaignTargetType(input.target_type);
      updateData.target_type = input.target_type;
      nextTargetType = input.target_type;
    }
    if (input.target_id !== undefined) {
      const normalizedTargetId = this.normalizeRequiredText(
        input.target_id,
        'target_id는 필수입니다',
      );
      await this.ensureCampaignTargetEntityExists(nextTargetType, normalizedTargetId);
      updateData.target_id = normalizedTargetId;
      nextTargetId = normalizedTargetId;
    }
    if (input.sort_order !== undefined) {
      this.assertSortOrder(input.sort_order);
      updateData.sort_order = input.sort_order;
    }
    if (input.is_excluded !== undefined) {
      updateData.is_excluded = input.is_excluded;
    }
    if (input.source_type !== undefined) {
      updateData.source_type = this.normalizeOptionalText(input.source_type);
    }
    if (input.source_id !== undefined) {
      updateData.source_id = this.normalizeOptionalText(input.source_id);
    }
    if (input.source_snapshot_json !== undefined) {
      updateData.source_snapshot_json = this.normalizeOptionalObjectJson(
        input.source_snapshot_json,
      );
    }
    if (input.metadata !== undefined) {
      updateData.metadata = input.metadata ?? {};
    }

    const nextExcluded = (input.is_excluded ?? current.is_excluded) as boolean;
    if (
      campaign.campaign_type === 'ALWAYS_ON' &&
      campaign.status === 'ACTIVE' &&
      !nextExcluded
    ) {
      const projectIds = await this.resolveProjectIdsByCampaignTarget(
        nextTargetType,
        nextTargetId,
      );
      await this.assertNoActiveAlwaysOnCampaignProjectConflicts({
        campaignId: campaign.id as string,
        projectIds,
      });
    }

    if (Object.keys(updateData).length === 0) {
      return current;
    }

    const { data, error } = await this.supabase
      .from('v2_campaign_targets')
      .update(updateData)
      .eq('id', targetId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'campaign target 수정 실패',
        500,
        'V2_CAMPAIGN_TARGET_UPDATE_FAILED',
      );
    }

    return data;
  }

  async deleteCampaignTarget(targetId: string): Promise<void> {
    await this.getCampaignTargetById(targetId);
    const { error } = await this.supabase
      .from('v2_campaign_targets')
      .update({
        deleted_at: new Date().toISOString(),
      })
      .eq('id', targetId);

    if (error) {
      throw new ApiException(
        'campaign target 삭제 실패',
        500,
        'V2_CAMPAIGN_TARGET_DELETE_FAILED',
      );
    }
  }

  async getPriceLists(filters: {
    campaignId?: string;
    scopeType?: V2PriceListScope;
    status?: V2PriceListStatus;
  }): Promise<any[]> {
    let query = this.supabase
      .from('v2_price_lists')
      .select('*')
      .is('deleted_at', null)
      .order('priority', { ascending: false })
      .order('updated_at', { ascending: false });

    if (filters.campaignId !== undefined) {
      if (filters.campaignId === '' || filters.campaignId === null) {
        query = query.is('campaign_id', null);
      } else {
        query = query.eq('campaign_id', filters.campaignId);
      }
    }
    if (filters.scopeType) {
      this.assertPriceListScope(filters.scopeType);
      query = query.eq('scope_type', filters.scopeType);
    }
    if (filters.status) {
      this.assertPriceListStatus(filters.status);
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiException(
        'price list 목록 조회 실패',
        500,
        'V2_PRICE_LISTS_FETCH_FAILED',
      );
    }

    return data || [];
  }

  async getPriceListById(priceListId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_price_lists')
      .select('*')
      .eq('id', priceListId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'price list 조회 실패',
        500,
        'V2_PRICE_LIST_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'price list를 찾을 수 없습니다',
        404,
        'V2_PRICE_LIST_NOT_FOUND',
      );
    }

    return data;
  }

  async createPriceList(input: CreateV2PriceListInput): Promise<any> {
    const name = this.normalizeRequiredText(input.name, 'price list name은 필수입니다');
    const requestedScopeType = input.scope_type;
    const status = input.status ?? 'DRAFT';
    const currencyCode = this.normalizeCurrencyCode(input.currency_code ?? 'KRW');
    if (requestedScopeType !== undefined) {
      this.assertPriceListScope(requestedScopeType);
    }
    this.assertPriceListStatus(status);
    this.assertSortOrder(input.priority);

    const startsAt = this.normalizeOptionalTimestamp(input.starts_at, 'starts_at');
    const endsAt = this.normalizeOptionalTimestamp(input.ends_at, 'ends_at');
    this.assertDateRange(startsAt, endsAt, 'price list 기간');

    const campaignId = this.normalizeOptionalText(input.campaign_id);
    let scopeType: V2PriceListScope = requestedScopeType ?? 'BASE';
    if (campaignId) {
      const campaign = await this.getCampaignById(campaignId);
      scopeType = this.resolvePriceListScopeForCampaign(campaign, requestedScopeType);
    }

    const { data, error } = await this.supabase
      .from('v2_price_lists')
      .insert({
        campaign_id: campaignId,
        name,
        scope_type: scopeType,
        status,
        currency_code: currencyCode,
        priority: input.priority ?? 0,
        starts_at: startsAt,
        ends_at: endsAt,
        channel_scope_json: this.normalizeOptionalArrayJson(input.channel_scope_json),
        source_type: this.normalizeOptionalText(input.source_type),
        source_id: this.normalizeOptionalText(input.source_id),
        source_snapshot_json: this.normalizeOptionalObjectJson(
          input.source_snapshot_json,
        ),
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'price list 생성 실패',
        500,
        'V2_PRICE_LIST_CREATE_FAILED',
      );
    }

    return data;
  }

  async updatePriceList(priceListId: string, input: UpdateV2PriceListInput): Promise<any> {
    const current = await this.getPriceListById(priceListId);
    const updateData: Record<string, unknown> = {};
    let nextCampaign: any | null = null;
    let nextCampaignId =
      this.normalizeOptionalText(current.campaign_id as string | null | undefined) ?? null;
    let requestedScopeType: V2PriceListScope | undefined;

    if (input.campaign_id !== undefined) {
      const campaignId = this.normalizeOptionalText(input.campaign_id);
      if (campaignId) {
        nextCampaign = await this.getCampaignById(campaignId);
      }
      nextCampaignId = campaignId;
      updateData.campaign_id = campaignId;
    }
    if (input.rollback_of_price_list_id !== undefined) {
      const rollbackId = this.normalizeOptionalText(input.rollback_of_price_list_id);
      if (rollbackId) {
        await this.getPriceListById(rollbackId);
      }
      updateData.rollback_of_price_list_id = rollbackId;
    }
    if (input.name !== undefined) {
      updateData.name = this.normalizeRequiredText(
        input.name,
        'price list name은 필수입니다',
      );
    }
    if (input.scope_type !== undefined) {
      this.assertPriceListScope(input.scope_type);
      requestedScopeType = input.scope_type;
    }
    if (input.status !== undefined) {
      this.assertPriceListStatus(input.status);
      this.assertPriceListStatusTransition(
        current.status as V2PriceListStatus,
        input.status,
      );
      updateData.status = input.status;
    }
    if (input.currency_code !== undefined) {
      updateData.currency_code = this.normalizeCurrencyCode(input.currency_code);
    }
    if (input.priority !== undefined) {
      this.assertSortOrder(input.priority);
      updateData.priority = input.priority;
    }
    if (input.published_at !== undefined) {
      updateData.published_at = this.normalizeOptionalTimestamp(
        input.published_at,
        'published_at',
      );
    }
    if (input.starts_at !== undefined) {
      updateData.starts_at = this.normalizeOptionalTimestamp(
        input.starts_at,
        'starts_at',
      );
    }
    if (input.ends_at !== undefined) {
      updateData.ends_at = this.normalizeOptionalTimestamp(input.ends_at, 'ends_at');
    }
    if (input.channel_scope_json !== undefined) {
      updateData.channel_scope_json = this.normalizeOptionalArrayJson(
        input.channel_scope_json,
      );
    }
    if (input.source_type !== undefined) {
      updateData.source_type = this.normalizeOptionalText(input.source_type);
    }
    if (input.source_id !== undefined) {
      updateData.source_id = this.normalizeOptionalText(input.source_id);
    }
    if (input.source_snapshot_json !== undefined) {
      updateData.source_snapshot_json = this.normalizeOptionalObjectJson(
        input.source_snapshot_json,
      );
    }
    if (input.metadata !== undefined) {
      updateData.metadata = input.metadata ?? {};
    }

    let nextScopeType =
      requestedScopeType ??
      (current.scope_type as V2PriceListScope);
    if (nextCampaignId) {
      if (!nextCampaign) {
        nextCampaign = await this.getCampaignById(nextCampaignId);
      }
      nextScopeType = this.resolvePriceListScopeForCampaign(
        nextCampaign,
        requestedScopeType ?? nextScopeType,
      );
    }
    if (
      nextScopeType !== (current.scope_type as V2PriceListScope) ||
      requestedScopeType !== undefined ||
      input.campaign_id !== undefined
    ) {
      updateData.scope_type = nextScopeType;
    }

    const nextStartsAt =
      (updateData.starts_at as string | null | undefined) ??
      (current.starts_at as string | null);
    const nextEndsAt =
      (updateData.ends_at as string | null | undefined) ??
      (current.ends_at as string | null);
    this.assertDateRange(nextStartsAt, nextEndsAt, 'price list 기간');

    if (Object.keys(updateData).length === 0) {
      return current;
    }

    const { data, error } = await this.supabase
      .from('v2_price_lists')
      .update(updateData)
      .eq('id', priceListId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'price list 수정 실패',
        500,
        'V2_PRICE_LIST_UPDATE_FAILED',
      );
    }

    return data;
  }

  async publishPriceList(priceListId: string): Promise<any> {
    const current = await this.getPriceListById(priceListId);
    this.assertPriceListStatusTransition(
      current.status as V2PriceListStatus,
      'PUBLISHED',
    );

    const now = new Date().toISOString();
    let demoteQuery = this.supabase
      .from('v2_price_lists')
      .update({
        status: 'ROLLED_BACK',
      })
      .neq('id', priceListId)
      .eq('scope_type', current.scope_type)
      .eq('currency_code', current.currency_code)
      .is('deleted_at', null)
      .eq('status', 'PUBLISHED');
    demoteQuery = current.campaign_id
      ? demoteQuery.eq('campaign_id', current.campaign_id)
      : demoteQuery.is('campaign_id', null);

    const { error: demoteError } = await demoteQuery;

    if (demoteError) {
      throw new ApiException(
        '기존 PUBLISHED price list 정리 실패',
        500,
        'V2_PRICE_LIST_UPDATE_FAILED',
      );
    }

    const { data, error } = await this.supabase
      .from('v2_price_lists')
      .update({
        status: 'PUBLISHED',
        published_at: now,
      })
      .eq('id', priceListId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'price list publish 실패',
        500,
        'V2_PRICE_LIST_PUBLISH_FAILED',
      );
    }

    return data;
  }

  async rollbackPriceList(priceListId: string): Promise<any> {
    const current = await this.getPriceListById(priceListId);
    if (current.status !== 'PUBLISHED') {
      throw new ApiException(
        'rollback 대상 price list는 PUBLISHED 상태여야 합니다',
        400,
        'INVALID_STATUS_TRANSITION',
      );
    }

    let candidateQuery = this.supabase
      .from('v2_price_lists')
      .select('*')
      .neq('id', priceListId)
      .eq('scope_type', current.scope_type)
      .eq('currency_code', current.currency_code)
      .is('deleted_at', null)
      .order('published_at', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1);
    candidateQuery = current.campaign_id
      ? candidateQuery.eq('campaign_id', current.campaign_id)
      : candidateQuery.is('campaign_id', null);

    const { data: candidate, error: candidateError } = await candidateQuery.maybeSingle();
    if (candidateError) {
      throw new ApiException(
        'rollback 대상 조회 실패',
        500,
        'V2_PRICE_LIST_FETCH_FAILED',
      );
    }
    if (!candidate) {
      throw new ApiException(
        'rollback할 이전 price list를 찾을 수 없습니다',
        404,
        'V2_PRICE_LIST_NOT_FOUND',
      );
    }

    const now = new Date().toISOString();
    const { data: rolledBack, error: rollbackError } = await this.supabase
      .from('v2_price_lists')
      .update({
        status: 'ROLLED_BACK',
      })
      .eq('id', priceListId)
      .select('*')
      .single();

    if (rollbackError || !rolledBack) {
      throw new ApiException(
        'price list rollback 실패',
        500,
        'V2_PRICE_LIST_ROLLBACK_FAILED',
      );
    }

    const { data: restored, error: restoreError } = await this.supabase
      .from('v2_price_lists')
      .update({
        status: 'PUBLISHED',
        published_at: now,
        rollback_of_price_list_id: priceListId,
      })
      .eq('id', candidate.id)
      .select('*')
      .single();

    if (restoreError || !restored) {
      throw new ApiException(
        'rollback 복구 대상 publish 실패',
        500,
        'V2_PRICE_LIST_ROLLBACK_FAILED',
      );
    }

    return {
      rolled_back_price_list: rolledBack,
      restored_price_list: restored,
    };
  }

  async getPriceListItems(priceListId: string): Promise<any[]> {
    await this.getPriceListById(priceListId);
    const { data, error } = await this.supabase
      .from('v2_price_list_items')
      .select(
        `
        *,
        product:v2_products(id,title,slug,status,product_kind,project_id),
        variant:v2_product_variants(id,sku,title,status,fulfillment_type,requires_shipping)
      `,
      )
      .eq('price_list_id', priceListId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) {
      throw new ApiException(
        'price list item 목록 조회 실패',
        500,
        'V2_PRICE_LIST_ITEMS_FETCH_FAILED',
      );
    }

    return data || [];
  }

  async createPriceListItem(
    priceListId: string,
    input: CreateV2PriceListItemInput,
  ): Promise<any> {
    await this.getPriceListById(priceListId);
    const productId = this.normalizeRequiredText(
      input.product_id,
      'product_id는 필수입니다',
    );
    await this.ensureProductExists(productId);

    const variantId = this.normalizeOptionalText(input.variant_id);
    if (variantId) {
      const variant = await this.getVariantById(variantId);
      if (variant.product_id !== productId) {
        throw new ApiException(
          'variant가 지정한 product에 속하지 않습니다',
          400,
          'VALIDATION_ERROR',
        );
      }
    }

    const status = input.status ?? 'ACTIVE';
    this.assertPriceItemStatus(status);
    const unitAmount = input.unit_amount;
    if (!Number.isInteger(unitAmount) || (unitAmount as number) < 0) {
      throw new ApiException(
        'unit_amount는 0 이상의 정수여야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    if (input.compare_at_amount !== undefined && input.compare_at_amount !== null) {
      if (
        !Number.isInteger(input.compare_at_amount) ||
        input.compare_at_amount < (unitAmount as number)
      ) {
        throw new ApiException(
          'compare_at_amount는 unit_amount 이상 정수여야 합니다',
          400,
          'VALIDATION_ERROR',
        );
      }
    }

    const minPurchaseQuantity = input.min_purchase_quantity ?? 1;
    const maxPurchaseQuantity = input.max_purchase_quantity ?? null;
    this.assertPurchaseQuantityRange(minPurchaseQuantity, maxPurchaseQuantity);

    const startsAt = this.normalizeOptionalTimestamp(input.starts_at, 'starts_at');
    const endsAt = this.normalizeOptionalTimestamp(input.ends_at, 'ends_at');
    this.assertDateRange(startsAt, endsAt, 'price list item 기간');

    const { data, error } = await this.supabase
      .from('v2_price_list_items')
      .insert({
        price_list_id: priceListId,
        product_id: productId,
        variant_id: variantId,
        status,
        unit_amount: unitAmount,
        compare_at_amount: input.compare_at_amount ?? null,
        min_purchase_quantity: minPurchaseQuantity,
        max_purchase_quantity: maxPurchaseQuantity,
        starts_at: startsAt,
        ends_at: endsAt,
        channel_scope_json: this.normalizeOptionalArrayJson(input.channel_scope_json),
        source_type: this.normalizeOptionalText(input.source_type),
        source_id: this.normalizeOptionalText(input.source_id),
        source_snapshot_json: this.normalizeOptionalObjectJson(
          input.source_snapshot_json,
        ),
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'price list item 생성 실패',
        500,
        'V2_PRICE_LIST_ITEM_CREATE_FAILED',
      );
    }

    return data;
  }

  async updatePriceListItem(
    itemId: string,
    input: UpdateV2PriceListItemInput,
  ): Promise<any> {
    const current = await this.getPriceListItemById(itemId);
    const updateData: Record<string, unknown> = {};

    const nextProductId =
      input.product_id !== undefined
        ? this.normalizeRequiredText(input.product_id, 'product_id는 필수입니다')
        : (current.product_id as string);
    if (input.product_id !== undefined) {
      await this.ensureProductExists(nextProductId);
      updateData.product_id = nextProductId;
    }

    if (input.variant_id !== undefined) {
      const variantId = this.normalizeOptionalText(input.variant_id);
      if (variantId) {
        const variant = await this.getVariantById(variantId);
        if (variant.product_id !== nextProductId) {
          throw new ApiException(
            'variant가 지정한 product에 속하지 않습니다',
            400,
            'VALIDATION_ERROR',
          );
        }
      }
      updateData.variant_id = variantId;
    }
    if (input.status !== undefined) {
      this.assertPriceItemStatus(input.status);
      updateData.status = input.status;
    }
    if (input.unit_amount !== undefined) {
      if (!Number.isInteger(input.unit_amount) || input.unit_amount < 0) {
        throw new ApiException(
          'unit_amount는 0 이상의 정수여야 합니다',
          400,
          'VALIDATION_ERROR',
        );
      }
      updateData.unit_amount = input.unit_amount;
    }
    if (input.compare_at_amount !== undefined) {
      if (input.compare_at_amount !== null) {
        const nextUnitAmount =
          (updateData.unit_amount as number | undefined) ??
          (current.unit_amount as number);
        if (
          !Number.isInteger(input.compare_at_amount) ||
          input.compare_at_amount < nextUnitAmount
        ) {
          throw new ApiException(
            'compare_at_amount는 unit_amount 이상 정수여야 합니다',
            400,
            'VALIDATION_ERROR',
          );
        }
      }
      updateData.compare_at_amount = input.compare_at_amount;
    }
    if (input.min_purchase_quantity !== undefined) {
      updateData.min_purchase_quantity = input.min_purchase_quantity;
    }
    if (input.max_purchase_quantity !== undefined) {
      updateData.max_purchase_quantity = input.max_purchase_quantity;
    }
    if (
      input.min_purchase_quantity !== undefined ||
      input.max_purchase_quantity !== undefined
    ) {
      const minPurchaseQuantity =
        (updateData.min_purchase_quantity as number | undefined) ??
        (current.min_purchase_quantity as number);
      const maxPurchaseQuantity =
        (updateData.max_purchase_quantity as number | null | undefined) ??
        (current.max_purchase_quantity as number | null);
      this.assertPurchaseQuantityRange(minPurchaseQuantity, maxPurchaseQuantity);
    }
    if (input.starts_at !== undefined) {
      updateData.starts_at = this.normalizeOptionalTimestamp(
        input.starts_at,
        'starts_at',
      );
    }
    if (input.ends_at !== undefined) {
      updateData.ends_at = this.normalizeOptionalTimestamp(input.ends_at, 'ends_at');
    }
    if (input.channel_scope_json !== undefined) {
      updateData.channel_scope_json = this.normalizeOptionalArrayJson(
        input.channel_scope_json,
      );
    }
    if (input.source_type !== undefined) {
      updateData.source_type = this.normalizeOptionalText(input.source_type);
    }
    if (input.source_id !== undefined) {
      updateData.source_id = this.normalizeOptionalText(input.source_id);
    }
    if (input.source_snapshot_json !== undefined) {
      updateData.source_snapshot_json = this.normalizeOptionalObjectJson(
        input.source_snapshot_json,
      );
    }
    if (input.metadata !== undefined) {
      updateData.metadata = input.metadata ?? {};
    }

    const nextStartsAt =
      (updateData.starts_at as string | null | undefined) ??
      (current.starts_at as string | null);
    const nextEndsAt =
      (updateData.ends_at as string | null | undefined) ??
      (current.ends_at as string | null);
    this.assertDateRange(nextStartsAt, nextEndsAt, 'price list item 기간');

    if (Object.keys(updateData).length === 0) {
      return current;
    }

    const { data, error } = await this.supabase
      .from('v2_price_list_items')
      .update(updateData)
      .eq('id', itemId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'price list item 수정 실패',
        500,
        'V2_PRICE_LIST_ITEM_UPDATE_FAILED',
      );
    }

    return data;
  }

  async deactivatePriceListItem(itemId: string): Promise<any> {
    await this.getPriceListItemById(itemId);
    const { data, error } = await this.supabase
      .from('v2_price_list_items')
      .update({
        status: 'INACTIVE',
      })
      .eq('id', itemId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'price list item 비활성화 실패',
        500,
        'V2_PRICE_LIST_ITEM_UPDATE_FAILED',
      );
    }

    return data;
  }

  async getPromotions(filters: {
    campaignId?: string;
    status?: V2PromotionStatus;
    couponRequired?: boolean;
  }): Promise<any[]> {
    let query = this.supabase
      .from('v2_promotions')
      .select('*')
      .is('deleted_at', null)
      .order('priority', { ascending: true })
      .order('updated_at', { ascending: false });

    if (filters.campaignId !== undefined) {
      if (filters.campaignId === '' || filters.campaignId === null) {
        query = query.is('campaign_id', null);
      } else {
        query = query.eq('campaign_id', filters.campaignId);
      }
    }
    if (filters.status) {
      this.assertPromotionStatus(filters.status);
      query = query.eq('status', filters.status);
    }
    if (filters.couponRequired !== undefined) {
      query = query.eq('coupon_required', filters.couponRequired);
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiException(
        'promotion 목록 조회 실패',
        500,
        'V2_PROMOTIONS_FETCH_FAILED',
      );
    }

    return data || [];
  }

  async getPromotionById(promotionId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_promotions')
      .select('*')
      .eq('id', promotionId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'promotion 조회 실패',
        500,
        'V2_PROMOTION_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'promotion을 찾을 수 없습니다',
        404,
        'V2_PROMOTION_NOT_FOUND',
      );
    }

    return data;
  }

  async createPromotion(input: CreateV2PromotionInput): Promise<any> {
    const name = this.normalizeRequiredText(input.name, 'promotion name은 필수입니다');
    const promotionType = input.promotion_type ?? 'ORDER_PERCENT';
    const status = input.status ?? 'DRAFT';
    const combinabilityMode = input.combinability_mode ?? 'STACKABLE';
    this.assertPromotionType(promotionType);
    this.assertPromotionStatus(status);
    this.assertCombinabilityMode(combinabilityMode);

    if (input.priority !== undefined) {
      this.assertSortOrder(input.priority);
    }
    if (input.discount_value === undefined || input.discount_value === null) {
      throw new ApiException(
        'discount_value는 필수입니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    this.assertNonNegativeNumber(input.discount_value, 'discount_value는 0 이상이어야 합니다');
    if (input.max_discount_amount !== undefined && input.max_discount_amount !== null) {
      if (!Number.isInteger(input.max_discount_amount) || input.max_discount_amount < 0) {
        throw new ApiException(
          'max_discount_amount는 0 이상의 정수여야 합니다',
          400,
          'VALIDATION_ERROR',
        );
      }
    }

    const startsAt = this.normalizeOptionalTimestamp(input.starts_at, 'starts_at');
    const endsAt = this.normalizeOptionalTimestamp(input.ends_at, 'ends_at');
    this.assertDateRange(startsAt, endsAt, 'promotion 기간');

    const campaignId = this.normalizeOptionalText(input.campaign_id);
    if (campaignId) {
      await this.getCampaignById(campaignId);
    }

    const { data, error } = await this.supabase
      .from('v2_promotions')
      .insert({
        campaign_id: campaignId,
        name,
        description: this.normalizeOptionalText(input.description),
        promotion_type: promotionType,
        status,
        combinability_mode: combinabilityMode,
        coupon_required: input.coupon_required ?? false,
        priority: input.priority ?? 100,
        discount_value: input.discount_value,
        max_discount_amount: input.max_discount_amount ?? null,
        starts_at: startsAt,
        ends_at: endsAt,
        channel_scope_json: this.normalizeOptionalArrayJson(input.channel_scope_json),
        purchase_limit_json: this.normalizeOptionalObjectJson(
          input.purchase_limit_json,
        ),
        source_type: this.normalizeOptionalText(input.source_type),
        source_id: this.normalizeOptionalText(input.source_id),
        source_snapshot_json: this.normalizeOptionalObjectJson(
          input.source_snapshot_json,
        ),
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'promotion 생성 실패',
        500,
        'V2_PROMOTION_CREATE_FAILED',
      );
    }

    return data;
  }

  async updatePromotion(
    promotionId: string,
    input: UpdateV2PromotionInput,
  ): Promise<any> {
    const current = await this.getPromotionById(promotionId);
    const updateData: Record<string, unknown> = {};

    if (input.campaign_id !== undefined) {
      const campaignId = this.normalizeOptionalText(input.campaign_id);
      if (campaignId) {
        await this.getCampaignById(campaignId);
      }
      updateData.campaign_id = campaignId;
    }
    if (input.name !== undefined) {
      updateData.name = this.normalizeRequiredText(
        input.name,
        'promotion name은 필수입니다',
      );
    }
    if (input.description !== undefined) {
      updateData.description = this.normalizeOptionalText(input.description);
    }
    if (input.promotion_type !== undefined) {
      this.assertPromotionType(input.promotion_type);
      updateData.promotion_type = input.promotion_type;
    }
    if (input.status !== undefined) {
      this.assertPromotionStatus(input.status);
      this.assertPromotionStatusTransition(
        current.status as V2PromotionStatus,
        input.status,
      );
      updateData.status = input.status;
    }
    if (input.combinability_mode !== undefined) {
      this.assertCombinabilityMode(input.combinability_mode);
      updateData.combinability_mode = input.combinability_mode;
    }
    if (input.coupon_required !== undefined) {
      updateData.coupon_required = input.coupon_required;
    }
    if (input.priority !== undefined) {
      this.assertSortOrder(input.priority);
      updateData.priority = input.priority;
    }
    if (input.discount_value !== undefined) {
      this.assertNonNegativeNumber(
        input.discount_value,
        'discount_value는 0 이상이어야 합니다',
      );
      updateData.discount_value = input.discount_value;
    }
    if (input.max_discount_amount !== undefined) {
      if (input.max_discount_amount !== null) {
        if (!Number.isInteger(input.max_discount_amount) || input.max_discount_amount < 0) {
          throw new ApiException(
            'max_discount_amount는 0 이상의 정수여야 합니다',
            400,
            'VALIDATION_ERROR',
          );
        }
      }
      updateData.max_discount_amount = input.max_discount_amount;
    }
    if (input.starts_at !== undefined) {
      updateData.starts_at = this.normalizeOptionalTimestamp(
        input.starts_at,
        'starts_at',
      );
    }
    if (input.ends_at !== undefined) {
      updateData.ends_at = this.normalizeOptionalTimestamp(input.ends_at, 'ends_at');
    }
    if (input.channel_scope_json !== undefined) {
      updateData.channel_scope_json = this.normalizeOptionalArrayJson(
        input.channel_scope_json,
      );
    }
    if (input.purchase_limit_json !== undefined) {
      updateData.purchase_limit_json = this.normalizeOptionalObjectJson(
        input.purchase_limit_json,
      );
    }
    if (input.source_type !== undefined) {
      updateData.source_type = this.normalizeOptionalText(input.source_type);
    }
    if (input.source_id !== undefined) {
      updateData.source_id = this.normalizeOptionalText(input.source_id);
    }
    if (input.source_snapshot_json !== undefined) {
      updateData.source_snapshot_json = this.normalizeOptionalObjectJson(
        input.source_snapshot_json,
      );
    }
    if (input.metadata !== undefined) {
      updateData.metadata = input.metadata ?? {};
    }

    const nextStartsAt =
      (updateData.starts_at as string | null | undefined) ??
      (current.starts_at as string | null);
    const nextEndsAt =
      (updateData.ends_at as string | null | undefined) ??
      (current.ends_at as string | null);
    this.assertDateRange(nextStartsAt, nextEndsAt, 'promotion 기간');

    if (Object.keys(updateData).length === 0) {
      return current;
    }

    const { data, error } = await this.supabase
      .from('v2_promotions')
      .update(updateData)
      .eq('id', promotionId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'promotion 수정 실패',
        500,
        'V2_PROMOTION_UPDATE_FAILED',
      );
    }

    return data;
  }

  async getPromotionRules(promotionId: string): Promise<any[]> {
    await this.getPromotionById(promotionId);
    const { data, error } = await this.supabase
      .from('v2_promotion_rules')
      .select('*')
      .eq('promotion_id', promotionId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true });

    if (error) {
      throw new ApiException(
        'promotion rule 목록 조회 실패',
        500,
        'V2_PROMOTION_RULES_FETCH_FAILED',
      );
    }

    return data || [];
  }

  async createPromotionRule(
    promotionId: string,
    input: CreateV2PromotionRuleInput,
  ): Promise<any> {
    await this.getPromotionById(promotionId);
    const ruleType = input.rule_type;
    if (!ruleType) {
      throw new ApiException(
        'rule_type은 필수입니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    this.assertPromotionRuleType(ruleType);
    if (input.sort_order !== undefined) {
      this.assertSortOrder(input.sort_order);
    }

    const status = input.status ?? 'ACTIVE';
    this.assertPriceItemStatus(status);

    const { data, error } = await this.supabase
      .from('v2_promotion_rules')
      .insert({
        promotion_id: promotionId,
        rule_type: ruleType,
        status,
        sort_order: input.sort_order ?? 0,
        rule_payload: this.normalizeOptionalObjectJson(input.rule_payload),
        source_type: this.normalizeOptionalText(input.source_type),
        source_id: this.normalizeOptionalText(input.source_id),
        source_snapshot_json: this.normalizeOptionalObjectJson(
          input.source_snapshot_json,
        ),
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'promotion rule 생성 실패',
        500,
        'V2_PROMOTION_RULE_CREATE_FAILED',
      );
    }

    return data;
  }

  async updatePromotionRule(
    ruleId: string,
    input: UpdateV2PromotionRuleInput,
  ): Promise<any> {
    const current = await this.getPromotionRuleById(ruleId);
    const updateData: Record<string, unknown> = {};

    if (input.rule_type !== undefined) {
      this.assertPromotionRuleType(input.rule_type);
      updateData.rule_type = input.rule_type;
    }
    if (input.status !== undefined) {
      this.assertPriceItemStatus(input.status);
      updateData.status = input.status;
    }
    if (input.sort_order !== undefined) {
      this.assertSortOrder(input.sort_order);
      updateData.sort_order = input.sort_order;
    }
    if (input.rule_payload !== undefined) {
      updateData.rule_payload = this.normalizeOptionalObjectJson(input.rule_payload);
    }
    if (input.source_type !== undefined) {
      updateData.source_type = this.normalizeOptionalText(input.source_type);
    }
    if (input.source_id !== undefined) {
      updateData.source_id = this.normalizeOptionalText(input.source_id);
    }
    if (input.source_snapshot_json !== undefined) {
      updateData.source_snapshot_json = this.normalizeOptionalObjectJson(
        input.source_snapshot_json,
      );
    }
    if (input.metadata !== undefined) {
      updateData.metadata = input.metadata ?? {};
    }

    if (Object.keys(updateData).length === 0) {
      return current;
    }

    const { data, error } = await this.supabase
      .from('v2_promotion_rules')
      .update(updateData)
      .eq('id', ruleId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'promotion rule 수정 실패',
        500,
        'V2_PROMOTION_RULE_UPDATE_FAILED',
      );
    }

    return data;
  }

  async getCoupons(filters: {
    promotionId?: string;
    status?: V2CouponStatus;
  }): Promise<any[]> {
    let query = this.supabase
      .from('v2_coupons')
      .select('*')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });

    if (filters.promotionId !== undefined) {
      if (filters.promotionId === '' || filters.promotionId === null) {
        query = query.is('promotion_id', null);
      } else {
        query = query.eq('promotion_id', filters.promotionId);
      }
    }
    if (filters.status) {
      this.assertCouponStatus(filters.status);
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiException(
        'coupon 목록 조회 실패',
        500,
        'V2_COUPONS_FETCH_FAILED',
      );
    }

    return data || [];
  }

  async getCouponById(couponId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_coupons')
      .select('*')
      .eq('id', couponId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException('coupon 조회 실패', 500, 'V2_COUPON_FETCH_FAILED');
    }
    if (!data) {
      throw new ApiException('coupon을 찾을 수 없습니다', 404, 'V2_COUPON_NOT_FOUND');
    }

    return data;
  }

  async getCouponRedemptions(filters: {
    couponId?: string;
    userId?: string;
    status?: V2CouponRedemptionStatus;
    quoteReference?: string;
  }): Promise<any[]> {
    let query = this.supabase
      .from('v2_coupon_redemptions')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (filters.couponId) {
      query = query.eq('coupon_id', filters.couponId);
    }
    if (filters.userId) {
      query = query.eq('user_id', filters.userId);
    }
    if (filters.status) {
      this.assertCouponRedemptionStatus(filters.status);
      query = query.eq('status', filters.status);
    }
    if (filters.quoteReference) {
      query = query.eq('quote_reference', filters.quoteReference);
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiException(
        'coupon redemption 목록 조회 실패',
        500,
        'V2_COUPON_REDEMPTIONS_FETCH_FAILED',
      );
    }

    return data || [];
  }

  async createCoupon(input: CreateV2CouponInput): Promise<any> {
    const code = this.normalizeRequiredText(input.code, 'coupon code는 필수입니다');
    const status = input.status ?? 'DRAFT';
    this.assertCouponStatus(status);
    await this.assertCouponCodeAvailable(code);

    if (input.max_issuance !== undefined && input.max_issuance !== null) {
      if (!Number.isInteger(input.max_issuance) || input.max_issuance < 0) {
        throw new ApiException(
          'max_issuance은 0 이상의 정수여야 합니다',
          400,
          'VALIDATION_ERROR',
        );
      }
    }
    if (input.max_redemptions_per_user !== undefined) {
      this.assertPositiveInteger(
        input.max_redemptions_per_user,
        'max_redemptions_per_user',
      );
    }

    const startsAt = this.normalizeOptionalTimestamp(input.starts_at, 'starts_at');
    const endsAt = this.normalizeOptionalTimestamp(input.ends_at, 'ends_at');
    this.assertDateRange(startsAt, endsAt, 'coupon 기간');

    const promotionId = this.normalizeOptionalText(input.promotion_id);
    if (promotionId) {
      await this.getPromotionById(promotionId);
    }

    const { data, error } = await this.supabase
      .from('v2_coupons')
      .insert({
        promotion_id: promotionId,
        code,
        status,
        starts_at: startsAt,
        ends_at: endsAt,
        max_issuance: input.max_issuance ?? null,
        max_redemptions_per_user: input.max_redemptions_per_user ?? 1,
        channel_scope_json: this.normalizeOptionalArrayJson(input.channel_scope_json),
        purchase_limit_json: this.normalizeOptionalObjectJson(
          input.purchase_limit_json,
        ),
        source_type: this.normalizeOptionalText(input.source_type),
        source_id: this.normalizeOptionalText(input.source_id),
        source_snapshot_json: this.normalizeOptionalObjectJson(
          input.source_snapshot_json,
        ),
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException('coupon 생성 실패', 500, 'V2_COUPON_CREATE_FAILED');
    }

    return data;
  }

  async updateCoupon(couponId: string, input: UpdateV2CouponInput): Promise<any> {
    const current = await this.getCouponById(couponId);
    const updateData: Record<string, unknown> = {};

    if (input.promotion_id !== undefined) {
      const promotionId = this.normalizeOptionalText(input.promotion_id);
      if (promotionId) {
        await this.getPromotionById(promotionId);
      }
      updateData.promotion_id = promotionId;
    }
    if (input.code !== undefined) {
      const code = this.normalizeRequiredText(input.code, 'coupon code는 필수입니다');
      await this.assertCouponCodeAvailable(code, couponId);
      updateData.code = code;
    }
    if (input.status !== undefined) {
      this.assertCouponStatus(input.status);
      this.assertCouponStatusTransition(current.status as V2CouponStatus, input.status);
      updateData.status = input.status;
    }
    if (input.starts_at !== undefined) {
      updateData.starts_at = this.normalizeOptionalTimestamp(
        input.starts_at,
        'starts_at',
      );
    }
    if (input.ends_at !== undefined) {
      updateData.ends_at = this.normalizeOptionalTimestamp(input.ends_at, 'ends_at');
    }
    if (input.max_issuance !== undefined) {
      if (input.max_issuance !== null) {
        if (!Number.isInteger(input.max_issuance) || input.max_issuance < 0) {
          throw new ApiException(
            'max_issuance은 0 이상의 정수여야 합니다',
            400,
            'VALIDATION_ERROR',
          );
        }
      }
      updateData.max_issuance = input.max_issuance;
    }
    if (input.max_redemptions_per_user !== undefined) {
      this.assertPositiveInteger(
        input.max_redemptions_per_user,
        'max_redemptions_per_user',
      );
      updateData.max_redemptions_per_user = input.max_redemptions_per_user;
    }
    if (input.channel_scope_json !== undefined) {
      updateData.channel_scope_json = this.normalizeOptionalArrayJson(
        input.channel_scope_json,
      );
    }
    if (input.purchase_limit_json !== undefined) {
      updateData.purchase_limit_json = this.normalizeOptionalObjectJson(
        input.purchase_limit_json,
      );
    }
    if (input.source_type !== undefined) {
      updateData.source_type = this.normalizeOptionalText(input.source_type);
    }
    if (input.source_id !== undefined) {
      updateData.source_id = this.normalizeOptionalText(input.source_id);
    }
    if (input.source_snapshot_json !== undefined) {
      updateData.source_snapshot_json = this.normalizeOptionalObjectJson(
        input.source_snapshot_json,
      );
    }
    if (input.metadata !== undefined) {
      updateData.metadata = input.metadata ?? {};
    }

    const nextStartsAt =
      (updateData.starts_at as string | null | undefined) ??
      (current.starts_at as string | null);
    const nextEndsAt =
      (updateData.ends_at as string | null | undefined) ??
      (current.ends_at as string | null);
    this.assertDateRange(nextStartsAt, nextEndsAt, 'coupon 기간');

    if (Object.keys(updateData).length === 0) {
      return current;
    }

    const { data, error } = await this.supabase
      .from('v2_coupons')
      .update(updateData)
      .eq('id', couponId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException('coupon 수정 실패', 500, 'V2_COUPON_UPDATE_FAILED');
    }

    return data;
  }

  async validateCoupon(input: ValidateV2CouponInput): Promise<any> {
    const code = this.normalizeRequiredText(input.code, 'coupon code는 필수입니다');
    const evaluatedAt = this.normalizeOptionalTimestamp(
      input.evaluated_at,
      'evaluated_at',
    )
      ? new Date(input.evaluated_at as string)
      : new Date();
    const now = evaluatedAt.toISOString();

    const { data: coupon, error } = await this.supabase
      .from('v2_coupons')
      .select(
        `
        *,
        promotion:v2_promotions(*)
      `,
      )
      .eq('code', code)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'coupon 검증 조회 실패',
        500,
        'V2_COUPON_FETCH_FAILED',
      );
    }
    if (!coupon) {
      return {
        code,
        eligible: false,
        reason: 'COUPON_NOT_FOUND',
      };
    }

    const checks: Array<{ key: string; passed: boolean; detail: string }> = [];

    checks.push({
      key: 'status_active',
      passed: coupon.status === 'ACTIVE',
      detail: `status=${coupon.status}`,
    });
    checks.push({
      key: 'period_active',
      passed: this.isTimestampInRange(coupon.starts_at, coupon.ends_at, now),
      detail: `starts_at=${coupon.starts_at || '-'}, ends_at=${coupon.ends_at || '-'}`,
    });
    checks.push({
      key: 'channel_scope_match',
      passed: this.matchesChannelScope(coupon.channel_scope_json, input.channel || null),
      detail: `channel=${input.channel || '-'}, scope=${JSON.stringify(
        coupon.channel_scope_json || [],
      )}`,
    });

    const maxIssuance = coupon.max_issuance as number | null;
    const reservedCount = (coupon.reserved_count as number) ?? 0;
    const redeemedCount = (coupon.redeemed_count as number) ?? 0;
    checks.push({
      key: 'issuance_limit',
      passed:
        maxIssuance === null || maxIssuance === undefined
          ? true
          : reservedCount + redeemedCount < maxIssuance,
      detail: `reserved=${reservedCount}, redeemed=${redeemedCount}, max_issuance=${maxIssuance ?? '-'}`,
    });

    let userUsageCount = 0;
    if (input.user_id) {
      const { data: userRedemptions, error: redemptionError } = await this.supabase
        .from('v2_coupon_redemptions')
        .select('id,status')
        .eq('coupon_id', coupon.id)
        .eq('user_id', input.user_id)
        .in('status', ['RESERVED', 'APPLIED'])
        .is('deleted_at', null);

      if (redemptionError) {
        throw new ApiException(
          'coupon 사용자 사용량 조회 실패',
          500,
          'V2_COUPON_REDEMPTIONS_FETCH_FAILED',
        );
      }
      userUsageCount = (userRedemptions || []).length;
    }
    checks.push({
      key: 'user_limit',
      passed:
        !input.user_id ||
        userUsageCount < ((coupon.max_redemptions_per_user as number) ?? 1),
      detail: `user_id=${input.user_id || '-'}, usage=${userUsageCount}, per_user_limit=${
        coupon.max_redemptions_per_user
      }`,
    });

    if (input.campaign_id) {
      const promotionCampaignId = coupon.promotion?.campaign_id as string | null;
      checks.push({
        key: 'campaign_match',
        passed: !promotionCampaignId || promotionCampaignId === input.campaign_id,
        detail: `promotion_campaign_id=${promotionCampaignId || '-'}, request_campaign_id=${
          input.campaign_id
        }`,
      });
    }

    const eligible = checks.every((check) => check.passed);
    const firstFailed = checks.find((check) => !check.passed);

    return {
      code,
      eligible,
      reason: firstFailed?.key || null,
      evaluated_at: now,
      coupon,
      checks,
    };
  }

  async reserveCoupon(couponId: string, input: ReserveV2CouponInput): Promise<any> {
    const coupon = await this.getCouponById(couponId);
    const userId = this.normalizeRequiredText(input.user_id, 'user_id는 필수입니다');
    const now = new Date().toISOString();
    const validation = await this.validateCoupon({
      code: coupon.code as string,
      user_id: userId,
      evaluated_at: now,
    });

    if (!validation.eligible) {
      throw new ApiException(
        `coupon reserve 불가: ${validation.reason || '검증 실패'}`,
        400,
        'COUPON_NOT_RESERVABLE',
      );
    }

    const { data: redemption, error: redemptionError } = await this.supabase
      .from('v2_coupon_redemptions')
      .insert({
        coupon_id: couponId,
        user_id: userId,
        status: 'RESERVED',
        quote_reference: this.normalizeOptionalText(input.quote_reference),
        reserved_at: now,
        expires_at: this.normalizeOptionalTimestamp(input.expires_at, 'expires_at'),
        source_type: this.normalizeOptionalText(input.source_type),
        source_id: this.normalizeOptionalText(input.source_id),
        source_snapshot_json: this.normalizeOptionalObjectJson(
          input.source_snapshot_json,
        ),
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (redemptionError || !redemption) {
      throw new ApiException(
        'coupon reserve 기록 생성 실패',
        500,
        'V2_COUPON_REDEMPTION_CREATE_FAILED',
      );
    }

    const { data: updatedCoupon, error: couponError } = await this.supabase
      .from('v2_coupons')
      .update({
        reserved_count: (coupon.reserved_count as number) + 1,
      })
      .eq('id', couponId)
      .select('*')
      .single();

    if (couponError || !updatedCoupon) {
      throw new ApiException(
        'coupon reserved_count 업데이트 실패',
        500,
        'V2_COUPON_UPDATE_FAILED',
      );
    }

    return {
      coupon: updatedCoupon,
      redemption,
    };
  }

  async releaseCouponRedemption(
    redemptionId: string,
    input: ReleaseV2CouponRedemptionInput = {},
  ): Promise<any> {
    const redemption = await this.getCouponRedemptionById(redemptionId);
    if (redemption.status !== 'RESERVED') {
      throw new ApiException(
        'RESERVED 상태만 release할 수 있습니다',
        400,
        'INVALID_STATUS_TRANSITION',
      );
    }

    const now = new Date().toISOString();
    const mergedMetadata = {
      ...(redemption.metadata || {}),
      ...(input.reason ? { release_reason: input.reason } : {}),
    };
    const { data: releasedRedemption, error: redemptionError } = await this.supabase
      .from('v2_coupon_redemptions')
      .update({
        status: 'RELEASED',
        released_at: now,
        metadata: mergedMetadata,
      })
      .eq('id', redemptionId)
      .select('*')
      .single();

    if (redemptionError || !releasedRedemption) {
      throw new ApiException(
        'coupon redemption release 실패',
        500,
        'V2_COUPON_REDEMPTION_UPDATE_FAILED',
      );
    }

    const coupon = await this.getCouponById(redemption.coupon_id as string);
    const nextReservedCount = Math.max((coupon.reserved_count as number) - 1, 0);
    const { data: updatedCoupon, error: couponError } = await this.supabase
      .from('v2_coupons')
      .update({
        reserved_count: nextReservedCount,
      })
      .eq('id', coupon.id)
      .select('*')
      .single();

    if (couponError || !updatedCoupon) {
      throw new ApiException(
        'coupon reserved_count release 업데이트 실패',
        500,
        'V2_COUPON_UPDATE_FAILED',
      );
    }

    return {
      coupon: updatedCoupon,
      redemption: releasedRedemption,
    };
  }

  async redeemCouponRedemption(
    redemptionId: string,
    input: RedeemV2CouponRedemptionInput = {},
  ): Promise<any> {
    const redemption = await this.getCouponRedemptionById(redemptionId);
    if (redemption.status !== 'RESERVED' && redemption.status !== 'APPLIED') {
      throw new ApiException(
        'RESERVED 또는 APPLIED 상태만 redeem할 수 있습니다',
        400,
        'INVALID_STATUS_TRANSITION',
      );
    }
    if (redemption.status === 'APPLIED') {
      const coupon = await this.getCouponById(redemption.coupon_id as string);
      return {
        coupon,
        redemption,
      };
    }

    const now = new Date().toISOString();
    const { data: appliedRedemption, error: redemptionError } = await this.supabase
      .from('v2_coupon_redemptions')
      .update({
        status: 'APPLIED',
        applied_at: now,
        order_id: this.normalizeOptionalText(input.order_id),
        metadata: {
          ...(redemption.metadata || {}),
          ...(input.metadata || {}),
        },
      })
      .eq('id', redemptionId)
      .select('*')
      .single();

    if (redemptionError || !appliedRedemption) {
      throw new ApiException(
        'coupon redemption redeem 실패',
        500,
        'V2_COUPON_REDEMPTION_UPDATE_FAILED',
      );
    }

    const coupon = await this.getCouponById(redemption.coupon_id as string);
    const nextReservedCount = Math.max((coupon.reserved_count as number) - 1, 0);
    const nextRedeemedCount = (coupon.redeemed_count as number) + 1;
    const shouldExhaust =
      coupon.max_issuance !== null &&
      coupon.max_issuance !== undefined &&
      nextReservedCount + nextRedeemedCount >= (coupon.max_issuance as number);

    const { data: updatedCoupon, error: couponError } = await this.supabase
      .from('v2_coupons')
      .update({
        reserved_count: nextReservedCount,
        redeemed_count: nextRedeemedCount,
        status: shouldExhaust ? 'EXHAUSTED' : coupon.status,
      })
      .eq('id', coupon.id)
      .select('*')
      .single();

    if (couponError || !updatedCoupon) {
      throw new ApiException(
        'coupon redeem 카운터 업데이트 실패',
        500,
        'V2_COUPON_UPDATE_FAILED',
      );
    }

    return {
      coupon: updatedCoupon,
      redemption: appliedRedemption,
    };
  }

  async buildPriceQuote(input: BuildV2PriceQuoteInput): Promise<any> {
    return this.computePricingPipeline(input);
  }

  async evaluatePromotions(input: BuildV2PriceQuoteInput): Promise<any> {
    const quote = await this.computePricingPipeline(input);
    return {
      quote_reference: quote.quote_reference,
      evaluated_at: quote.evaluated_at,
      coupon: quote.coupon,
      promotion_evaluations: quote.promotion_evaluations,
      applied_promotions: quote.applied_promotions,
      summary: quote.summary,
    };
  }

  async getPricingDebugTrace(input: BuildV2PriceQuoteInput): Promise<any> {
    const quote = await this.computePricingPipeline(input);
    return {
      quote_reference: quote.quote_reference,
      evaluated_at: quote.evaluated_at,
      context: quote.context,
      price_candidates: quote.price_candidates,
      promotion_evaluations: quote.promotion_evaluations,
      applied_promotions: quote.applied_promotions,
      coupon: quote.coupon,
      lines: quote.lines,
      summary: quote.summary,
    };
  }

  getOrderSnapshotContract(): any {
    return {
      order_adjustments: {
        required_fields: [
          'target_scope',
          'source_type',
          'source_id',
          'code_snapshot',
          'label_snapshot',
          'amount',
          'calculation_snapshot',
        ],
        enums: {
          target_scope: ['ORDER', 'SHIPPING'],
          source_type: ['PROMOTION', 'COUPON', 'MANUAL', 'ETC'],
        },
      },
      order_item_adjustments: {
        required_fields: [
          'order_item_id',
          'source_type',
          'source_id',
          'label_snapshot',
          'amount',
          'sequence_no',
          'calculation_snapshot',
        ],
        enums: {
          source_type: ['PRICE_LIST', 'PROMOTION', 'COUPON', 'BUNDLE_ALLOC', 'MANUAL'],
        },
      },
      mapping_examples: [
        {
          pricing_source: 'BASE_PRICE_LIST',
          adjustment_target: 'order_item_adjustments',
          source_type: 'PRICE_LIST',
        },
        {
          pricing_source: 'AUTO_PROMOTION',
          adjustment_target: 'order_item_adjustments',
          source_type: 'PROMOTION',
        },
        {
          pricing_source: 'COUPON_PROMOTION',
          adjustment_target: 'order_item_adjustments',
          source_type: 'COUPON',
        },
        {
          pricing_source: 'SHIPPING_PROMOTION',
          adjustment_target: 'order_adjustments',
          source_type: 'PROMOTION',
          target_scope: 'SHIPPING',
        },
      ],
    };
  }

  private async computePricingPipeline(input: BuildV2PriceQuoteInput): Promise<any> {
    const evaluatedAt =
      this.normalizeOptionalTimestamp(input.evaluated_at, 'evaluated_at') ??
      new Date().toISOString();
    const quoteReference =
      this.normalizeOptionalText(input.quote_reference) ??
      `Q-${Date.now().toString(36).toUpperCase()}`;
    const channel = this.normalizeOptionalText(input.channel);
    const campaignId = this.normalizeOptionalText(input.campaign_id);
    const couponCode = this.normalizeOptionalText(input.coupon_code);
    const userId = this.normalizeOptionalText(input.user_id);
    const shippingAmount = this.normalizeOptionalInteger(
      input.shipping_amount,
      'shipping_amount',
    );

    if (campaignId) {
      await this.getCampaignById(campaignId);
    }

    const linesInput = Array.isArray(input.lines) ? input.lines : [];
    if (linesInput.length === 0) {
      throw new ApiException('lines는 최소 1개 이상 필요합니다', 400, 'VALIDATION_ERROR');
    }

    const normalizedLines = linesInput.map((line, index) => {
      const variantId = this.normalizeRequiredText(
        line.variant_id,
        `lines[${index}].variant_id는 필수입니다`,
      );
      const quantity = line.quantity ?? 1;
      this.assertPositiveInteger(quantity, `lines[${index}].quantity`);
      return { variant_id: variantId, quantity };
    });

    const variantIds = Array.from(
      new Set(normalizedLines.map((line) => line.variant_id)),
    );
    const { data: variants, error: variantsError } = await this.supabase
      .from('v2_product_variants')
      .select('id,product_id,sku,title,fulfillment_type,requires_shipping,status')
      .in('id', variantIds)
      .is('deleted_at', null);

    if (variantsError) {
      throw new ApiException(
        'quote variant 조회 실패',
        500,
        'V2_VARIANTS_FETCH_FAILED',
      );
    }
    const variantById = new Map(((variants || []) as any[]).map((row) => [row.id, row]));
    for (const line of normalizedLines) {
      const variant = variantById.get(line.variant_id);
      if (!variant) {
        throw new ApiException(
          `variant를 찾을 수 없습니다: ${line.variant_id}`,
          404,
          'V2_VARIANT_NOT_FOUND',
        );
      }
      if (variant.status !== 'ACTIVE') {
        throw new ApiException(
          `ACTIVE variant만 quote 계산할 수 있습니다: ${line.variant_id}`,
          400,
          'VALIDATION_ERROR',
        );
      }
    }

    const productIds = Array.from(
      new Set((variants || []).map((variant: any) => variant.product_id as string)),
    );
    const { data: products, error: productsError } = await this.supabase
      .from('v2_products')
      .select('id,project_id,title,product_kind,status')
      .in('id', productIds)
      .is('deleted_at', null);

    if (productsError) {
      throw new ApiException(
        'quote product 조회 실패',
        500,
        'V2_PRODUCTS_FETCH_FAILED',
      );
    }
    const productById = new Map(((products || []) as any[]).map((row) => [row.id, row]));

    const { data: priceItems, error: priceItemsError } = await this.supabase
      .from('v2_price_list_items')
      .select(
        `
        *,
        price_list:v2_price_lists(
          *,
          campaign:v2_campaigns(
            id,
            campaign_type,
            status,
            starts_at,
            ends_at,
            channel_scope_json,
            deleted_at
          )
        )
      `,
      )
      .in('product_id', productIds)
      .eq('status', 'ACTIVE')
      .is('deleted_at', null);

    if (priceItemsError) {
      throw new ApiException(
        'price list item 조회 실패',
        500,
        'V2_PRICE_LIST_ITEMS_FETCH_FAILED',
      );
    }

    const normalizedPriceItems = (priceItems || []) as any[];
    const campaignTargetEligibilityByCampaignId =
      await this.loadCampaignTargetEligibilityByCampaignIds(
        normalizedPriceItems.map(
          (item) => item?.price_list?.campaign_id as string | null | undefined,
        ),
      );

    const nowIso = evaluatedAt;
    const lineResults: any[] = [];
    const priceCandidates: any[] = [];
    let subtotal = 0;

    for (const line of normalizedLines) {
      const variant = variantById.get(line.variant_id);
      const product = productById.get(variant.product_id);
      if (!product) {
        throw new ApiException(
          `상품을 찾을 수 없습니다: ${variant.product_id}`,
          404,
          'V2_PRODUCT_NOT_FOUND',
        );
      }

      const candidates = this.filterShopPriceCandidates({
        productId: product.id as string,
        projectId: product.project_id as string | null,
        variantId: line.variant_id,
        priceItems: normalizedPriceItems,
        evaluatedAt: nowIso,
        channel,
        campaignTargetEligibilityByCampaignId,
      });

      const priceSelection = this.buildShopPriceSelectionFromCandidates({
        candidates,
        campaignId,
        evaluatedAt: nowIso,
        channel,
      });
      const selectedBase = priceSelection.base;
      const selectedOverride = priceSelection.override;
      const selectedItem = priceSelection.selected;

      if (!selectedItem) {
        throw new ApiException(
          `적용 가능한 가격표가 없습니다 (variant=${line.variant_id})`,
          400,
          'PRICE_LIST_NOT_FOUND',
        );
      }

      const lineSubtotal = (selectedItem.unit_amount as number) * line.quantity;
      subtotal += lineSubtotal;

      lineResults.push({
        variant_id: variant.id,
        product_id: product.id,
        project_id: product.project_id,
        product_kind: product.product_kind,
        sku: variant.sku,
        title: variant.title,
        quantity: line.quantity,
        fulfillment_type: variant.fulfillment_type,
        requires_shipping: variant.requires_shipping,
        pricing: {
          base_price_list_id: selectedBase?.price_list_id ?? null,
          base_price_list_item_id: selectedBase?.id ?? null,
          base_unit_amount: selectedBase?.unit_amount ?? null,
          override_price_list_id: selectedOverride?.price_list_id ?? null,
          override_price_list_item_id: selectedOverride?.id ?? null,
          override_unit_amount: selectedOverride?.unit_amount ?? null,
          selected_price_list_id: selectedItem.price_list_id,
          selected_price_list_item_id: selectedItem.id,
          unit_amount: selectedItem.unit_amount,
          compare_at_amount: selectedItem.compare_at_amount,
          line_subtotal: lineSubtotal,
        },
        adjustments: [],
        discounts: {
          auto: 0,
          coupon: 0,
          manual: 0,
        },
      });

      priceCandidates.push({
        variant_id: variant.id,
        candidates: candidates.map((item) => ({
          item_id: item.id,
          price_list_id: item.price_list_id,
          scope_type: item.price_list?.scope_type,
          campaign_id: item.price_list?.campaign_id,
          priority: item.price_list?.priority,
          unit_amount: item.unit_amount,
          starts_at: item.starts_at,
          ends_at: item.ends_at,
          selected:
            item.id === selectedItem.id &&
            item.price_list_id === selectedItem.price_list_id,
        })),
      });
    }

    const couponValidation = couponCode
      ? await this.validateCoupon({
          code: couponCode,
          user_id: userId,
          campaign_id: campaignId,
          channel,
          evaluated_at: evaluatedAt,
        })
      : null;

    const { data: promotions, error: promotionsError } = await this.supabase
      .from('v2_promotions')
      .select('*')
      .eq('status', 'ACTIVE')
      .is('deleted_at', null)
      .order('priority', { ascending: true });
    if (promotionsError) {
      throw new ApiException(
        'promotion 조회 실패',
        500,
        'V2_PROMOTIONS_FETCH_FAILED',
      );
    }

    const promotionIds = ((promotions || []) as any[]).map((promotion) => promotion.id);
    let promotionRules: any[] = [];
    if (promotionIds.length > 0) {
      const { data: rules, error: rulesError } = await this.supabase
        .from('v2_promotion_rules')
        .select('*')
        .in('promotion_id', promotionIds)
        .eq('status', 'ACTIVE')
        .is('deleted_at', null)
        .order('sort_order', { ascending: true });
      if (rulesError) {
        throw new ApiException(
          'promotion rule 조회 실패',
          500,
          'V2_PROMOTION_RULES_FETCH_FAILED',
        );
      }
      promotionRules = rules || [];
    }
    const rulesByPromotionId = new Map<string, any[]>();
    for (const rule of promotionRules) {
      const list = rulesByPromotionId.get(rule.promotion_id) || [];
      list.push(rule);
      rulesByPromotionId.set(rule.promotion_id, list);
    }

    const lineRemaining = lineResults.map((line) => line.pricing.line_subtotal as number);
    let orderLevelDiscountTotal = 0;
    let shippingDiscountTotal = 0;
    let runningShippingAmount = shippingAmount ?? 0;

    const promotionEvaluations: any[] = [];
    const appliedPromotions: any[] = [];

    const phases = ['auto', 'coupon', 'shipping'] as const;
    for (const phase of phases) {
      let exclusiveApplied = false;
      const phasePromotions = ((promotions || []) as any[])
        .filter((promotion) =>
          this.resolvePromotionPhase(promotion) === phase,
        )
        .filter((promotion) =>
          this.isTimestampInRange(promotion.starts_at, promotion.ends_at, nowIso),
        )
        .filter((promotion) =>
          this.matchesChannelScope(promotion.channel_scope_json, channel),
        )
        .filter((promotion) => !promotion.campaign_id || promotion.campaign_id === campaignId)
        .sort((a, b) => (a.priority as number) - (b.priority as number));

      for (const promotion of phasePromotions) {
        const rules = rulesByPromotionId.get(promotion.id) || [];
        const ruleResult = this.evaluatePromotionRules(rules, {
          lines: lineResults,
          channel,
          campaignId,
          userId,
          subtotal,
          currentSubtotal: lineRemaining.reduce((sum, value) => sum + value, 0),
        });

        const couponMatched =
          !promotion.coupon_required ||
          (couponValidation?.eligible &&
            couponValidation?.coupon?.promotion_id === promotion.id);
        const eligible = ruleResult.passed && couponMatched;

        const evaluation: any = {
          promotion_id: promotion.id,
          name: promotion.name,
          phase,
          promotion_type: promotion.promotion_type,
          combinability_mode: promotion.combinability_mode,
          eligible,
          rule_results: ruleResult.results,
          coupon_matched: couponMatched,
          skipped_reason: null,
          applied_discount_amount: 0,
        };

        if (!eligible) {
          evaluation.skipped_reason = ruleResult.passed
            ? 'COUPON_NOT_MATCHED'
            : 'RULE_NOT_MATCHED';
          promotionEvaluations.push(evaluation);
          continue;
        }

        if (exclusiveApplied) {
          evaluation.skipped_reason = 'EXCLUSIVE_PROMOTION_ALREADY_APPLIED';
          promotionEvaluations.push(evaluation);
          continue;
        }

        const eligibleIndexes = this.getPromotionEligibleLineIndexes(
          lineResults,
          rules,
        );
        const type = promotion.promotion_type as V2PromotionType;
        let appliedAmount = 0;

        if (type === 'ITEM_PERCENT' || type === 'ITEM_FIXED') {
          const remainingByIndex = eligibleIndexes.map((index) => lineRemaining[index]);
          const rawDiscounts = this.calculateItemPromotionDiscounts(
            type,
            Number(promotion.discount_value),
            lineResults,
            eligibleIndexes,
            remainingByIndex,
          );
          const cappedDiscounts = this.capDiscountAllocations(
            rawDiscounts,
            promotion.max_discount_amount as number | null,
          );
          for (let i = 0; i < eligibleIndexes.length; i += 1) {
            const lineIndex = eligibleIndexes[i];
            const discount = Math.min(cappedDiscounts[i], lineRemaining[lineIndex]);
            if (discount <= 0) {
              continue;
            }
            lineRemaining[lineIndex] -= discount;
            const line = lineResults[lineIndex];
            const bucket = phase === 'coupon' ? 'coupon' : 'auto';
            line.discounts[bucket] += discount;
            line.adjustments.push({
              source_type: phase === 'coupon' ? 'COUPON' : 'PROMOTION',
              source_id: promotion.id,
              label_snapshot: promotion.name,
              amount: -discount,
              phase,
            });
            appliedAmount += discount;
          }
        } else if (type === 'ORDER_PERCENT' || type === 'ORDER_FIXED') {
          const currentSubtotal = lineRemaining.reduce((sum, value) => sum + value, 0);
          const calculated = this.calculateOrderPromotionDiscount(
            type,
            Number(promotion.discount_value),
            currentSubtotal,
            promotion.max_discount_amount as number | null,
          );
          appliedAmount = calculated;
          orderLevelDiscountTotal += calculated;
        } else if (type === 'SHIPPING_PERCENT' || type === 'SHIPPING_FIXED') {
          const calculated = this.calculateOrderPromotionDiscount(
            type,
            Number(promotion.discount_value),
            runningShippingAmount,
            promotion.max_discount_amount as number | null,
          );
          appliedAmount = calculated;
          runningShippingAmount -= calculated;
          shippingDiscountTotal += calculated;
        }

        evaluation.applied_discount_amount = appliedAmount;
        if (appliedAmount <= 0) {
          evaluation.skipped_reason = 'NO_EFFECT';
          promotionEvaluations.push(evaluation);
          continue;
        }

        promotionEvaluations.push(evaluation);
        appliedPromotions.push({
          promotion_id: promotion.id,
          name: promotion.name,
          phase,
          promotion_type: promotion.promotion_type,
          applied_discount_amount: appliedAmount,
        });

        if (promotion.combinability_mode === 'EXCLUSIVE') {
          exclusiveApplied = true;
        }
      }
    }

    const itemDiscountTotal = lineResults.reduce(
      (sum, line) => sum + line.discounts.auto + line.discounts.coupon,
      0,
    );
    const lineSubtotalAfterItemDiscounts = lineRemaining.reduce(
      (sum, value) => sum + value,
      0,
    );
    const totalDiscount = itemDiscountTotal + orderLevelDiscountTotal + shippingDiscountTotal;
    const payable =
      lineSubtotalAfterItemDiscounts -
      orderLevelDiscountTotal +
      (shippingAmount ?? 0) -
      shippingDiscountTotal;

    return {
      quote_reference: quoteReference,
      evaluated_at: evaluatedAt,
      context: {
        campaign_id: campaignId,
        channel,
        coupon_code: couponCode,
        user_id: userId,
        shipping_amount: shippingAmount ?? 0,
      },
      price_candidates: priceCandidates,
      coupon: couponValidation,
      lines: lineResults.map((line, index) => ({
        ...line,
        pricing: {
          ...line.pricing,
          line_total_after_item_discounts: lineRemaining[index],
        },
      })),
      promotion_evaluations: promotionEvaluations,
      applied_promotions: appliedPromotions,
      summary: {
        subtotal,
        line_subtotal_after_item_discounts: lineSubtotalAfterItemDiscounts,
        item_discount_total: itemDiscountTotal,
        order_level_discount_total: orderLevelDiscountTotal,
        shipping_amount: shippingAmount ?? 0,
        shipping_discount_total: shippingDiscountTotal,
        total_discount: totalDiscount,
        total_payable_amount: Math.max(payable, 0),
      },
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
        severity: this.resolveMigrationCheckSeverity('projects_backfill_complete'),
        expected: 'missing_project_mappings=0',
        actual: `missing_project_mappings=${missingProjectMappings.length}`,
        detail: 'legacy projects가 모두 v2_projects로 매핑되어야 함',
      },
      {
        key: 'artists_backfill_complete',
        passed: missingArtistMappings.length === 0,
        severity: this.resolveMigrationCheckSeverity('artists_backfill_complete'),
        expected: 'missing_artist_mappings=0',
        actual: `missing_artist_mappings=${missingArtistMappings.length}`,
        detail: 'legacy artists가 모두 v2_artists로 매핑되어야 함',
      },
      {
        key: 'products_backfill_complete',
        passed: missingProductMappings.length === 0,
        severity: this.resolveMigrationCheckSeverity('products_backfill_complete'),
        expected: 'missing_product_mappings=0',
        actual: `missing_product_mappings=${missingProductMappings.length}`,
        detail: 'legacy products가 모두 v2_products로 매핑되어야 함',
      },
      {
        key: 'project_artist_links_complete',
        passed: missingProjectArtistLinks.length === 0,
        severity: this.resolveMigrationCheckSeverity('project_artist_links_complete'),
        expected: 'missing_project_artist_links=0',
        actual: `missing_project_artist_links=${missingProjectArtistLinks.length}`,
        detail: 'legacy artist.project_id 기준 링크가 v2_project_artists에 존재해야 함',
      },
      {
        key: 'product_project_mapping_consistent',
        passed: productProjectMappingMismatch.length === 0,
        severity: this.resolveMigrationCheckSeverity(
          'product_project_mapping_consistent',
        ),
        expected: 'product_project_mapping_mismatch=0',
        actual: `product_project_mapping_mismatch=${productProjectMappingMismatch.length}`,
        detail: 'v2_products.project_id가 legacy product.project_id 매핑과 일치해야 함',
      },
      {
        key: 'v2_products_have_variants',
        passed: productsWithoutVariants.length === 0,
        severity: this.resolveMigrationCheckSeverity('v2_products_have_variants'),
        expected: 'products_without_variants=0',
        actual: `products_without_variants=${productsWithoutVariants.length}`,
        detail: '모든 v2 product는 최소 1개의 variant를 가져야 함',
      },
      {
        key: 'active_products_have_primary_media',
        passed: activeProductsWithoutPrimaryMedia.length === 0,
        severity: this.resolveMigrationCheckSeverity(
          'active_products_have_primary_media',
        ),
        expected: 'active_products_without_primary_media=0',
        actual: `active_products_without_primary_media=${activeProductsWithoutPrimaryMedia.length}`,
        detail: 'ACTIVE product는 ACTIVE primary media를 가져야 함',
      },
      {
        key: 'digital_variants_have_assets',
        passed: digitalVariantsWithoutAssets.length === 0,
        severity: this.resolveMigrationCheckSeverity('digital_variants_have_assets'),
        expected: 'digital_variants_without_assets=0',
        actual: `digital_variants_without_assets=${digitalVariantsWithoutAssets.length}`,
        detail: 'DIGITAL variant는 최소 1개의 digital asset을 가져야 함',
      },
      {
        key: 'active_digital_variants_have_ready_assets',
        passed: activeDigitalVariantsWithoutReadyAsset.length === 0,
        severity: this.resolveMigrationCheckSeverity(
          'active_digital_variants_have_ready_assets',
        ),
        expected: 'active_digital_variants_without_ready_asset=0',
        actual: `active_digital_variants_without_ready_asset=${activeDigitalVariantsWithoutReadyAsset.length}`,
        detail: 'ACTIVE DIGITAL variant는 READY asset을 가져야 함',
      },
    ];

    const blockingChecks = checks
      .filter((check) => !check.passed && check.severity === 'BLOCKING')
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
        severity: check.severity,
        detail: check.detail,
        action: this.resolveReadSwitchAction(check.key),
      }),
    );

    const passedChecks = checklist.filter((item) => item.passed).length;
    const failedChecks = checklist.length - passedChecks;
    const blockingFailedChecks = checklist.filter(
      (item) => !item.passed && item.severity === 'BLOCKING',
    ).length;

    return {
      generated_at: compareReport.generated_at,
      ready: compareReport.read_switch.ready,
      total_checks: checklist.length,
      passed_checks: passedChecks,
      failed_checks: failedChecks,
      blocking_failed_checks: blockingFailedChecks,
      advisory_failed_checks: failedChecks - blockingFailedChecks,
      blocking_checks: compareReport.read_switch.blocking_checks,
      checklist,
      recommended_order: compareReport.read_switch.recommended_order,
    };
  }

  async getReadSwitchRemediationTasks(sampleLimit = 20): Promise<any> {
    const compareReport = await this.getMigrationCompareReport(sampleLimit);
    const differences = (compareReport.differences || {}) as Record<string, unknown>;
    const failedChecks = (compareReport.checks as MigrationCheckResult[]).filter(
      (check) => !check.passed,
    );

    const tasks: ReadSwitchRemediationTask[] = failedChecks.map((check) => {
      const differenceSource = this.resolveDifferenceSourceByCheckKey(check.key);
      const samples = this.resolveDifferenceSamples(
        differences,
        differenceSource?.group,
        differenceSource?.key,
      );

      return {
        check_key: check.key,
        severity: check.severity,
        title: this.resolveReadSwitchTaskTitle(check.key),
        detail: check.detail,
        expected: check.expected,
        actual: check.actual,
        action: this.resolveReadSwitchAction(check.key),
        sample_source: differenceSource
          ? `${differenceSource.group}.${differenceSource.key}`
          : null,
        sample_count: samples.length,
        samples,
      };
    });

    const blockingTasks = tasks.filter((task) => task.severity === 'BLOCKING');
    const advisoryTasks = tasks.filter((task) => task.severity === 'ADVISORY');

    return {
      generated_at: compareReport.generated_at,
      ready: compareReport.read_switch.ready,
      summary: {
        failed_total: tasks.length,
        blocking_failed: blockingTasks.length,
        advisory_failed: advisoryTasks.length,
      },
      blocking_tasks: blockingTasks,
      advisory_tasks: advisoryTasks,
      recommended_order: compareReport.read_switch.recommended_order,
    };
  }

  async getBundleDefinitions(filters: {
    bundleProductId?: string;
    status?: V2BundleStatus;
  }): Promise<any[]> {
    if (filters.bundleProductId) {
      const bundleProduct = await this.getProductById(filters.bundleProductId);
      if (bundleProduct.product_kind !== 'BUNDLE') {
        throw new ApiException(
          'bundle_product_id는 BUNDLE product여야 합니다',
          400,
          'VALIDATION_ERROR',
        );
      }
    }
    if (filters.status) {
      this.assertBundleStatus(filters.status);
    }

    let query = this.supabase
      .from('v2_bundle_definitions')
      .select('*')
      .is('deleted_at', null)
      .order('version_no', { ascending: false });

    if (filters.bundleProductId) {
      query = query.eq('bundle_product_id', filters.bundleProductId);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiException(
        'bundle definition 목록 조회 실패',
        500,
        'V2_BUNDLE_DEFINITIONS_FETCH_FAILED',
      );
    }

    return data || [];
  }

  async getBundleDefinitionById(definitionId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_bundle_definitions')
      .select('*')
      .eq('id', definitionId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'bundle definition 조회 실패',
        500,
        'V2_BUNDLE_DEFINITION_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'bundle definition을 찾을 수 없습니다',
        404,
        'V2_BUNDLE_DEFINITION_NOT_FOUND',
      );
    }

    return data;
  }

  async createBundleDefinition(input: CreateV2BundleDefinitionInput): Promise<any> {
    const bundleProductId = this.normalizeRequiredText(
      input.bundle_product_id,
      'bundle_product_id는 필수입니다',
    );
    const bundleProduct = await this.getProductById(bundleProductId);
    if (bundleProduct.product_kind !== 'BUNDLE') {
      throw new ApiException(
        'bundle_product_id는 BUNDLE product여야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    const anchorProductId =
      this.normalizeOptionalText(input.anchor_product_id) ?? bundleProductId;
    if (anchorProductId !== bundleProductId) {
      throw new ApiException(
        '현재 1차 rollout에서는 anchor_product_id는 bundle_product_id와 동일해야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    const mode = input.mode ?? 'FIXED';
    const status = input.status ?? 'DRAFT';
    const pricingStrategy = input.pricing_strategy ?? 'WEIGHTED';

    this.assertBundleMode(mode);
    this.assertBundleStatus(status);
    this.assertBundlePricingStrategy(pricingStrategy);

    let versionNo: number;
    if (input.version_no !== undefined) {
      this.assertPositiveInteger(input.version_no, 'version_no');
      await this.assertBundleDefinitionVersionAvailable(
        bundleProductId,
        input.version_no,
      );
      versionNo = input.version_no;
    } else {
      versionNo = await this.getNextBundleDefinitionVersion(bundleProductId);
    }

    const { data, error } = await this.supabase
      .from('v2_bundle_definitions')
      .insert({
        bundle_product_id: bundleProductId,
        anchor_product_id: anchorProductId,
        version_no: versionNo,
        mode,
        status,
        pricing_strategy: pricingStrategy,
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'bundle definition 생성 실패',
        500,
        'V2_BUNDLE_DEFINITION_CREATE_FAILED',
      );
    }

    return data;
  }

  async updateBundleDefinition(
    definitionId: string,
    input: UpdateV2BundleDefinitionInput,
  ): Promise<any> {
    const current = await this.getBundleDefinitionById(definitionId);
    this.assertBundleDefinitionEditable(current.status);
    const updateData: Record<string, unknown> = {};

    if (input.mode !== undefined) {
      this.assertBundleMode(input.mode);
      updateData.mode = input.mode;
    }
    if (input.pricing_strategy !== undefined) {
      this.assertBundlePricingStrategy(input.pricing_strategy);
      updateData.pricing_strategy = input.pricing_strategy;
    }
    if (input.status !== undefined) {
      this.assertBundleStatus(input.status);
      if (input.status === 'ACTIVE') {
        throw new ApiException(
          'ACTIVE 전환은 publish API를 사용하세요',
          400,
          'VALIDATION_ERROR',
        );
      }
      this.assertBundleStatusTransition(current.status, input.status);
      updateData.status = input.status;
    }
    if (input.metadata !== undefined) {
      updateData.metadata = input.metadata ?? {};
    }

    if (Object.keys(updateData).length === 0) {
      return current;
    }

    const { data, error } = await this.supabase
      .from('v2_bundle_definitions')
      .update(updateData)
      .eq('id', definitionId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'bundle definition 수정 실패',
        500,
        'V2_BUNDLE_DEFINITION_UPDATE_FAILED',
      );
    }

    return data;
  }

  async publishBundleDefinition(definitionId: string): Promise<any> {
    const current = await this.getBundleDefinitionById(definitionId);
    if (current.status === 'ARCHIVED') {
      throw new ApiException(
        'ARCHIVED bundle definition은 publish할 수 없습니다',
        400,
        'INVALID_STATUS_TRANSITION',
      );
    }
    const validation = await this.validateBundleDefinition(definitionId, {});
    if (!validation.ready) {
      throw new ApiException(
        'bundle definition 검증 실패: publish 전에 구성 유효성을 먼저 해결하세요',
        400,
        'V2_BUNDLE_DEFINITION_NOT_READY',
      );
    }

    const { error: resetError } = await this.supabase
      .from('v2_bundle_definitions')
      .update({ status: 'DRAFT' })
      .eq('bundle_product_id', current.bundle_product_id)
      .eq('status', 'ACTIVE')
      .is('deleted_at', null)
      .neq('id', definitionId);

    if (resetError) {
      throw new ApiException(
        '기존 ACTIVE bundle definition 정리 실패',
        500,
        'V2_BUNDLE_DEFINITION_UPDATE_FAILED',
      );
    }

    const { data, error } = await this.supabase
      .from('v2_bundle_definitions')
      .update({ status: 'ACTIVE' })
      .eq('id', definitionId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'bundle definition publish 실패',
        500,
        'V2_BUNDLE_DEFINITION_PUBLISH_FAILED',
      );
    }

    return data;
  }

  async archiveBundleDefinition(definitionId: string): Promise<any> {
    const current = await this.getBundleDefinitionById(definitionId);
    this.assertBundleStatusTransition(current.status, 'ARCHIVED');

    const { data, error } = await this.supabase
      .from('v2_bundle_definitions')
      .update({ status: 'ARCHIVED' })
      .eq('id', definitionId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'bundle definition archive 실패',
        500,
        'V2_BUNDLE_DEFINITION_ARCHIVE_FAILED',
      );
    }

    return data;
  }

  async cloneBundleDefinitionVersion(
    definitionId: string,
    input: CloneV2BundleDefinitionVersionInput,
  ): Promise<any> {
    const sourceDefinition = await this.getBundleDefinitionById(definitionId);
    if (sourceDefinition.status === 'ARCHIVED') {
      throw new ApiException(
        'ARCHIVED bundle definition은 clone할 수 없습니다',
        400,
        'INVALID_STATUS_TRANSITION',
      );
    }

    const nextVersion = await this.getNextBundleDefinitionVersion(
      sourceDefinition.bundle_product_id,
    );
    const clonedAt = new Date().toISOString();
    const cloneMetadata = {
      ...(sourceDefinition.metadata ?? {}),
      ...(input.metadata_patch ?? {}),
      cloned_from_definition_id: sourceDefinition.id,
      cloned_at: clonedAt,
    };

    const { data: newDefinition, error: createError } = await this.supabase
      .from('v2_bundle_definitions')
      .insert({
        bundle_product_id: sourceDefinition.bundle_product_id,
        anchor_product_id: sourceDefinition.anchor_product_id,
        version_no: nextVersion,
        mode: sourceDefinition.mode,
        status: 'DRAFT',
        pricing_strategy: sourceDefinition.pricing_strategy,
        metadata: cloneMetadata,
      })
      .select('*')
      .single();

    if (createError || !newDefinition) {
      throw new ApiException(
        'bundle definition version clone 실패',
        500,
        'V2_BUNDLE_DEFINITION_CLONE_FAILED',
      );
    }

    const sourceComponents = await this.fetchBundleComponents(definitionId);
    if (sourceComponents.length > 0) {
      const { data: insertedComponents, error: componentInsertError } = await this.supabase
        .from('v2_bundle_components')
        .insert(
          sourceComponents.map((component) => ({
            bundle_definition_id: newDefinition.id,
            component_variant_id: component.component_variant_id,
            is_required: component.is_required,
            min_quantity: component.min_quantity,
            max_quantity: component.max_quantity,
            default_quantity: component.default_quantity,
            sort_order: component.sort_order,
            price_allocation_weight: component.price_allocation_weight,
            metadata: {
              ...(component.metadata ?? {}),
              cloned_from_component_id: component.id,
              cloned_at: clonedAt,
            },
          })),
        )
        .select('id, component_variant_id');

      if (componentInsertError) {
        throw new ApiException(
          'bundle component clone 실패',
          500,
          'V2_BUNDLE_COMPONENT_CLONE_FAILED',
        );
      }

      const sourceComponentIds = sourceComponents.map((component) => component.id);
      const { data: optionRows, error: optionFetchError } = await this.supabase
        .from('v2_bundle_component_options')
        .select('*')
        .in('bundle_component_id', sourceComponentIds)
        .order('sort_order', { ascending: true });

      if (optionFetchError) {
        throw new ApiException(
          'bundle component option 조회 실패',
          500,
          'V2_BUNDLE_COMPONENT_OPTIONS_FETCH_FAILED',
        );
      }

      if ((optionRows || []).length > 0) {
        const sourceByVariantId = new Map(
          sourceComponents.map((component) => [
            component.component_variant_id as string,
            component.id as string,
          ]),
        );
        const insertedByVariantId = new Map<string, string>(
          ((insertedComponents || []) as any[]).map((component) => [
            component.component_variant_id as string,
            component.id as string,
          ]),
        );
        const oldToNewComponentId = new Map<string, string>();
        sourceByVariantId.forEach((oldId, variantId) => {
          const newId = insertedByVariantId.get(variantId);
          if (newId) {
            oldToNewComponentId.set(oldId, newId);
          }
        });

        const rowsToInsert = (optionRows || [])
          .map((row) => {
            const mappedComponentId = oldToNewComponentId.get(
              row.bundle_component_id as string,
            );
            if (!mappedComponentId) {
              return null;
            }
            return {
              bundle_component_id: mappedComponentId,
              option_key: row.option_key,
              option_value: row.option_value,
              sort_order: row.sort_order ?? 0,
              metadata: {
                ...(row.metadata ?? {}),
                cloned_from_option_id: row.id,
                cloned_at: clonedAt,
              },
            };
          })
          .filter((row) => row !== null);

        if (rowsToInsert.length > 0) {
          const { error: optionInsertError } = await this.supabase
            .from('v2_bundle_component_options')
            .insert(rowsToInsert);

          if (optionInsertError) {
            throw new ApiException(
              'bundle component option clone 실패',
              500,
              'V2_BUNDLE_COMPONENT_OPTIONS_CLONE_FAILED',
            );
          }
        }
      }
    }

    return this.getBundleDefinitionById(newDefinition.id);
  }

  async getBundleComponents(bundleDefinitionId: string): Promise<any[]> {
    await this.getBundleDefinitionById(bundleDefinitionId);
    const components = await this.fetchBundleComponents(bundleDefinitionId);
    if (components.length === 0) {
      return [];
    }

    const componentIds = components.map((component) => component.id);
    const componentVariantIds = components.map(
      (component) => component.component_variant_id as string,
    );
    const { data: optionRows, error: optionError } = await this.supabase
      .from('v2_bundle_component_options')
      .select('*')
      .in('bundle_component_id', componentIds)
      .order('sort_order', { ascending: true });

    if (optionError) {
      throw new ApiException(
        'bundle component option 조회 실패',
        500,
        'V2_BUNDLE_COMPONENT_OPTIONS_FETCH_FAILED',
      );
    }
    const { data: variantRows, error: variantError } = await this.supabase
      .from('v2_product_variants')
      .select('id,sku,title,fulfillment_type,requires_shipping,track_inventory,status')
      .in('id', componentVariantIds)
      .is('deleted_at', null);

    if (variantError) {
      throw new ApiException(
        'bundle component variant 조회 실패',
        500,
        'V2_VARIANTS_FETCH_FAILED',
      );
    }

    const optionsByComponentId = new Map<string, any[]>();
    for (const option of optionRows || []) {
      const current = optionsByComponentId.get(option.bundle_component_id) || [];
      current.push(option);
      optionsByComponentId.set(option.bundle_component_id, current);
    }
    const variantById = new Map<string, any>(
      ((variantRows || []) as any[]).map((variant) => [variant.id as string, variant]),
    );

    return components.map((component) => ({
      ...component,
      options: optionsByComponentId.get(component.id) || [],
      variant: variantById.get(component.component_variant_id as string) ?? null,
    }));
  }

  async createBundleComponent(
    bundleDefinitionId: string,
    input: CreateV2BundleComponentInput,
  ): Promise<any> {
    const definition = await this.getBundleDefinitionById(bundleDefinitionId);
    this.assertBundleDefinitionEditable(definition.status);

    const componentVariantId = this.normalizeRequiredText(
      input.component_variant_id,
      'component_variant_id는 필수입니다',
    );
    const componentVariant = await this.getVariantById(componentVariantId);
    await this.assertBundleComponentVariantAllowed(componentVariant);

    const minQuantity = input.min_quantity ?? 1;
    const maxQuantity = input.max_quantity ?? minQuantity;
    const defaultQuantity = input.default_quantity ?? minQuantity;
    this.assertBundleComponentQuantityRange(minQuantity, maxQuantity, defaultQuantity);
    this.assertSortOrder(input.sort_order);

    const priceAllocationWeight = input.price_allocation_weight ?? 1;
    this.assertNonNegativeNumber(
      priceAllocationWeight,
      'price_allocation_weight는 0 이상의 수여야 합니다',
    );

    const { data, error } = await this.supabase
      .from('v2_bundle_components')
      .insert({
        bundle_definition_id: bundleDefinitionId,
        component_variant_id: componentVariant.id,
        is_required: input.is_required ?? true,
        min_quantity: minQuantity,
        max_quantity: maxQuantity,
        default_quantity: defaultQuantity,
        sort_order: input.sort_order ?? 0,
        price_allocation_weight: priceAllocationWeight,
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'bundle component 생성 실패',
        500,
        'V2_BUNDLE_COMPONENT_CREATE_FAILED',
      );
    }

    return data;
  }

  async updateBundleComponent(
    componentId: string,
    input: UpdateV2BundleComponentInput,
  ): Promise<any> {
    const current = await this.getBundleComponentById(componentId);
    const definition = await this.getBundleDefinitionById(current.bundle_definition_id);
    this.assertBundleDefinitionEditable(definition.status);

    const updateData: Record<string, unknown> = {};

    if (input.component_variant_id !== undefined) {
      const variantId = this.normalizeRequiredText(
        input.component_variant_id,
        'component_variant_id는 필수입니다',
      );
      const variant = await this.getVariantById(variantId);
      await this.assertBundleComponentVariantAllowed(variant);
      updateData.component_variant_id = variantId;
    }

    const nextMin = input.min_quantity ?? current.min_quantity;
    const nextMax = input.max_quantity ?? current.max_quantity;
    const nextDefault = input.default_quantity ?? current.default_quantity;
    this.assertBundleComponentQuantityRange(nextMin, nextMax, nextDefault);

    if (input.min_quantity !== undefined) {
      updateData.min_quantity = input.min_quantity;
    }
    if (input.max_quantity !== undefined) {
      updateData.max_quantity = input.max_quantity;
    }
    if (input.default_quantity !== undefined) {
      updateData.default_quantity = input.default_quantity;
    }
    if (input.is_required !== undefined) {
      updateData.is_required = input.is_required;
    }
    if (input.sort_order !== undefined) {
      this.assertSortOrder(input.sort_order);
      updateData.sort_order = input.sort_order;
    }
    if (input.price_allocation_weight !== undefined) {
      this.assertNonNegativeNumber(
        input.price_allocation_weight,
        'price_allocation_weight는 0 이상의 수여야 합니다',
      );
      updateData.price_allocation_weight = input.price_allocation_weight;
    }
    if (input.metadata !== undefined) {
      updateData.metadata = input.metadata ?? {};
    }

    if (Object.keys(updateData).length === 0) {
      return current;
    }

    const { data, error } = await this.supabase
      .from('v2_bundle_components')
      .update(updateData)
      .eq('id', componentId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        'bundle component 수정 실패',
        500,
        'V2_BUNDLE_COMPONENT_UPDATE_FAILED',
      );
    }

    return data;
  }

  async createBundleComponentOption(
    componentId: string,
    input: CreateV2BundleComponentOptionInput,
  ): Promise<any> {
    const component = await this.getBundleComponentById(componentId);
    const definition = await this.getBundleDefinitionById(component.bundle_definition_id);
    this.assertBundleDefinitionEditable(definition.status);

    const optionKey = this.normalizeRequiredText(
      input.option_key,
      'option_key는 필수입니다',
    );
    const optionValue = this.normalizeRequiredText(
      input.option_value,
      'option_value는 필수입니다',
    );
    this.assertSortOrder(input.sort_order);

    const { data, error } = await this.supabase
      .from('v2_bundle_component_options')
      .insert({
        bundle_component_id: componentId,
        option_key: optionKey,
        option_value: optionValue,
        sort_order: input.sort_order ?? 0,
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      if (error?.code === '23505') {
        throw new ApiException(
          '이미 존재하는 bundle component option입니다',
          409,
          'V2_BUNDLE_COMPONENT_OPTION_EXISTS',
        );
      }
      throw new ApiException(
        'bundle component option 생성 실패',
        500,
        'V2_BUNDLE_COMPONENT_OPTION_CREATE_FAILED',
      );
    }

    return data;
  }

  async updateBundleComponentOption(
    optionId: string,
    input: UpdateV2BundleComponentOptionInput,
  ): Promise<any> {
    const current = await this.getBundleComponentOptionById(optionId);
    const component = await this.getBundleComponentById(current.bundle_component_id);
    const definition = await this.getBundleDefinitionById(component.bundle_definition_id);
    this.assertBundleDefinitionEditable(definition.status);

    const updateData: Record<string, unknown> = {};

    if (input.option_key !== undefined) {
      updateData.option_key = this.normalizeRequiredText(
        input.option_key,
        'option_key는 필수입니다',
      );
    }
    if (input.option_value !== undefined) {
      updateData.option_value = this.normalizeRequiredText(
        input.option_value,
        'option_value는 필수입니다',
      );
    }
    if (input.sort_order !== undefined) {
      this.assertSortOrder(input.sort_order);
      updateData.sort_order = input.sort_order;
    }
    if (input.metadata !== undefined) {
      updateData.metadata = input.metadata ?? {};
    }

    if (Object.keys(updateData).length === 0) {
      return current;
    }

    const { data, error } = await this.supabase
      .from('v2_bundle_component_options')
      .update(updateData)
      .eq('id', optionId)
      .select('*')
      .single();

    if (error || !data) {
      if (error?.code === '23505') {
        throw new ApiException(
          '이미 존재하는 bundle component option입니다',
          409,
          'V2_BUNDLE_COMPONENT_OPTION_EXISTS',
        );
      }
      throw new ApiException(
        'bundle component option 수정 실패',
        500,
        'V2_BUNDLE_COMPONENT_OPTION_UPDATE_FAILED',
      );
    }

    return data;
  }

  async deleteBundleComponentOption(optionId: string): Promise<void> {
    const current = await this.getBundleComponentOptionById(optionId);
    const component = await this.getBundleComponentById(current.bundle_component_id);
    const definition = await this.getBundleDefinitionById(component.bundle_definition_id);
    this.assertBundleDefinitionEditable(definition.status);

    const { error } = await this.supabase
      .from('v2_bundle_component_options')
      .delete()
      .eq('id', optionId);

    if (error) {
      throw new ApiException(
        'bundle component option 삭제 실패',
        500,
        'V2_BUNDLE_COMPONENT_OPTION_DELETE_FAILED',
      );
    }
  }

  async deleteBundleComponent(componentId: string): Promise<void> {
    const component = await this.getBundleComponentById(componentId);
    const definition = await this.getBundleDefinitionById(component.bundle_definition_id);
    this.assertBundleDefinitionEditable(definition.status);
    const { error } = await this.supabase
      .from('v2_bundle_components')
      .update({
        deleted_at: new Date().toISOString(),
      })
      .eq('id', componentId);

    if (error) {
      throw new ApiException(
        'bundle component 삭제 실패',
        500,
        'V2_BUNDLE_COMPONENT_DELETE_FAILED',
      );
    }
  }

  async validateBundleDefinition(
    bundleDefinitionId: string,
    input: ValidateV2BundleDefinitionInput,
  ): Promise<any> {
    const definition = await this.getBundleDefinitionById(bundleDefinitionId);
    const bundleProduct = await this.getProductById(definition.bundle_product_id);
    const components = await this.fetchBundleComponents(bundleDefinitionId);
    const selectedMap = this.normalizeBundleSelectionMap(input.selected_components);
    const componentVariantIds = components.map(
      (component) => component.component_variant_id as string,
    );

    let componentVariantsResolvable = true;
    let componentVariantsDetail = 'all component variants are active and resolvable';
    if (componentVariantIds.length > 0) {
      const { data: variants, error: variantsError } = await this.supabase
        .from('v2_product_variants')
        .select('id,status')
        .in('id', componentVariantIds)
        .is('deleted_at', null);

      if (variantsError) {
        throw new ApiException(
          'bundle validation용 variant 조회 실패',
          500,
          'V2_VARIANTS_FETCH_FAILED',
        );
      }

      const variantById = new Map<string, any>(
        ((variants || []) as any[]).map((variant) => [variant.id as string, variant]),
      );

      const missingVariantIds = componentVariantIds.filter(
        (variantId) => !variantById.has(variantId),
      );
      const inactiveVariantIds = ((variants || []) as any[])
        .filter((variant) => variant.status === 'INACTIVE')
        .map((variant) => variant.id as string);

      if (missingVariantIds.length > 0 || inactiveVariantIds.length > 0) {
        componentVariantsResolvable = false;
        componentVariantsDetail = `missing=${missingVariantIds.length}, inactive=${inactiveVariantIds.length}`;
      }
    }

    const componentByVariantId = new Map(
      components.map((component) => [component.component_variant_id as string, component]),
    );
    const selectedKnown = Array.from(selectedMap.keys()).every((variantId) =>
      componentByVariantId.has(variantId),
    );

    const resolvedSelections = components.map((component) => {
      const variantId = component.component_variant_id as string;
      const selectedQuantity = selectedMap.get(variantId);
      const quantityPerParent =
        definition.mode === 'CUSTOMIZABLE'
          ? (selectedQuantity ?? component.default_quantity)
          : component.default_quantity;
      return {
        bundle_component_id: component.id,
        component_variant_id: variantId,
        quantity_per_parent: quantityPerParent,
      };
    });

    const selectedWithinRange = resolvedSelections.every((selection) => {
      const component = componentByVariantId.get(selection.component_variant_id);
      if (!component) {
        return false;
      }
      return (
        selection.quantity_per_parent >= component.min_quantity &&
        selection.quantity_per_parent <= component.max_quantity
      );
    });

    const requiredSatisfied = components.every((component) => {
      if (!component.is_required) {
        return true;
      }
      const matched = resolvedSelections.find(
        (selection) => selection.component_variant_id === component.component_variant_id,
      );
      return (matched?.quantity_per_parent ?? 0) >= component.min_quantity;
    });
    const fixedModeSelectionConsistent =
      definition.mode !== 'FIXED' ||
      Array.from(selectedMap.entries()).every(([variantId, quantity]) => {
        const component = componentByVariantId.get(variantId);
        return !!component && quantity === component.default_quantity;
      });

    const checks = [
      {
        key: 'bundle_product_kind_valid',
        passed: bundleProduct.product_kind === 'BUNDLE',
        detail: `bundle_product_kind=${bundleProduct.product_kind}`,
      },
      {
        key: 'has_components',
        passed: components.length > 0,
        detail: `component_count=${components.length}`,
      },
      {
        key: 'component_variants_resolvable',
        passed: componentVariantsResolvable,
        detail: componentVariantsDetail,
      },
      {
        key: 'component_quantity_range_valid',
        passed: components.every(
          (component) =>
            component.min_quantity <= component.default_quantity &&
            component.default_quantity <= component.max_quantity,
        ),
        detail: '각 component의 min/default/max 범위 유효성 확인',
      },
      {
        key: 'pricing_weights_valid',
        passed:
          definition.pricing_strategy !== 'WEIGHTED' ||
          components.every(
            (component) => Number(component.price_allocation_weight ?? 0) > 0,
          ),
        detail: `pricing_strategy=${definition.pricing_strategy}`,
      },
      {
        key: 'fixed_mode_components_required',
        passed:
          definition.mode !== 'FIXED' ||
          components.every((component) => component.is_required === true),
        detail: `mode=${definition.mode}`,
      },
      {
        key: 'fixed_mode_selection_consistent',
        passed: fixedModeSelectionConsistent,
        detail:
          definition.mode !== 'FIXED'
            ? 'mode is not FIXED'
            : 'selected quantities must match default quantities',
      },
      {
        key: 'selected_components_known',
        passed: selectedKnown,
        detail: selectedKnown
          ? 'all selected components are known'
          : 'unknown selected component variant exists',
      },
      {
        key: 'selected_components_within_range',
        passed: selectedWithinRange,
        detail: selectedWithinRange
          ? 'selected quantities are within range'
          : 'selected quantity out of range exists',
      },
      {
        key: 'required_components_satisfied',
        passed: requiredSatisfied,
        detail: requiredSatisfied
          ? 'all required components are satisfied'
          : 'required component quantity is missing',
      },
    ];

    return {
      bundle_definition_id: bundleDefinitionId,
      mode: definition.mode,
      status: definition.status,
      ready: checks.every((check) => check.passed),
      checks,
      selected_components_resolved: resolvedSelections,
    };
  }

  async previewBundle(input: PreviewV2BundleInput): Promise<any> {
    return this.resolveBundle({
      bundle_definition_id: input.bundle_definition_id,
      parent_variant_id: null,
      parent_quantity: input.parent_quantity,
      parent_unit_amount: null,
      selected_components: input.selected_components,
    });
  }

  async resolveBundle(input: ResolveV2BundleInput): Promise<any> {
    const bundleDefinitionId = this.normalizeRequiredText(
      input.bundle_definition_id,
      'bundle_definition_id는 필수입니다',
    );
    const parentQuantity = input.parent_quantity ?? 1;
    this.assertPositiveInteger(parentQuantity, 'parent_quantity');

    let parentUnitAmount: number | null = null;
    if (input.parent_unit_amount !== undefined && input.parent_unit_amount !== null) {
      if (
        !Number.isInteger(input.parent_unit_amount) ||
        input.parent_unit_amount < 0
      ) {
        throw new ApiException(
          'parent_unit_amount는 0 이상의 정수여야 합니다',
          400,
          'VALIDATION_ERROR',
        );
      }
      parentUnitAmount = input.parent_unit_amount;
    }

    const definition = await this.getBundleDefinitionById(bundleDefinitionId);
    const validation = await this.validateBundleDefinition(bundleDefinitionId, {
      selected_components: input.selected_components,
    });
    if (!validation.ready) {
      throw new ApiException(
        'bundle resolve 전 구성 검증에 실패했습니다',
        400,
        'BUNDLE_RESOLVE_VALIDATION_FAILED',
      );
    }

    const components = await this.fetchBundleComponents(bundleDefinitionId);
    const componentVariantIds = components.map(
      (component) => component.component_variant_id as string,
    );
    const { data: variants, error: variantsError } = await this.supabase
      .from('v2_product_variants')
      .select('id,product_id,sku,title,fulfillment_type,requires_shipping,status')
      .in('id', componentVariantIds)
      .is('deleted_at', null);

    if (variantsError) {
      throw new ApiException(
        'bundle resolve용 variant 조회 실패',
        500,
        'V2_VARIANTS_FETCH_FAILED',
      );
    }

    const variantById = new Map<string, any>(
      ((variants || []) as any[]).map((variant) => [variant.id as string, variant]),
    );
    const missingVariantIds = componentVariantIds.filter(
      (variantId) => !variantById.has(variantId),
    );
    if (missingVariantIds.length > 0) {
      throw new ApiException(
        'bundle resolve에 필요한 component variant를 찾을 수 없습니다',
        400,
        'BUNDLE_RESOLVE_VARIANT_NOT_FOUND',
      );
    }
    const inactiveVariantIds = ((variants || []) as any[])
      .filter((variant) => variant.status === 'INACTIVE')
      .map((variant) => variant.id as string);
    if (inactiveVariantIds.length > 0) {
      throw new ApiException(
        'INACTIVE component variant는 bundle resolve에 사용할 수 없습니다',
        400,
        'BUNDLE_RESOLVE_VARIANT_INACTIVE',
      );
    }

    const resolvedSelections = validation.selected_components_resolved as Array<{
      bundle_component_id: string;
      component_variant_id: string;
      quantity_per_parent: number;
    }>;

    const componentById = new Map(
      components.map((component) => [component.id as string, component]),
    );

    const componentLines = resolvedSelections
      .map((selection) => {
        const component = componentById.get(selection.bundle_component_id);
        const variant = variantById.get(selection.component_variant_id);
        if (!component || !variant || selection.quantity_per_parent <= 0) {
          return null;
        }
        return {
          line_type: 'BUNDLE_COMPONENT',
          bundle_component_id_snapshot: component.id,
          component_variant_id: variant.id,
          component_variant_sku: variant.sku,
          component_variant_title: variant.title,
          fulfillment_type: variant.fulfillment_type,
          requires_shipping: variant.requires_shipping,
          quantity_per_parent: selection.quantity_per_parent,
          quantity: selection.quantity_per_parent * parentQuantity,
          allocation_weight:
            Number(component.price_allocation_weight ?? 0) *
            selection.quantity_per_parent,
          allocated_unit_amount: null as number | null,
          allocated_discount_amount: 0,
          allocated_total_amount_per_parent: null as number | null,
        };
      })
      .filter((line): line is NonNullable<typeof line> => line !== null);

    if (parentUnitAmount !== null && componentLines.length > 0) {
      const allocations = this.allocateAmountByWeights(
        parentUnitAmount,
        componentLines.map((line) => line.allocation_weight),
      );
      componentLines.forEach((line, index) => {
        const perParentAllocated = allocations[index] ?? 0;
        line.allocated_total_amount_per_parent = perParentAllocated;
        const unitAmount = Math.floor(perParentAllocated / line.quantity_per_parent);
        line.allocated_unit_amount = unitAmount;
        line.allocated_discount_amount =
          perParentAllocated - unitAmount * line.quantity_per_parent;
      });
    }

    const digitalLines = componentLines.filter(
      (line) => line.fulfillment_type === 'DIGITAL',
    );
    const physicalLines = componentLines.filter(
      (line) => line.fulfillment_type === 'PHYSICAL',
    );
    const allocatedComponentTotalPerParent =
      parentUnitAmount === null
        ? null
        : componentLines.reduce(
            (sum, line) => sum + (line.allocated_total_amount_per_parent ?? 0),
            0,
          );

    return {
      bundle_definition_id: bundleDefinitionId,
      mode: definition.mode,
      status: definition.status,
      parent_line: {
        line_type: 'BUNDLE_PARENT',
        bundle_definition_id_snapshot: bundleDefinitionId,
        parent_variant_id: input.parent_variant_id ?? null,
        quantity: parentQuantity,
        parent_unit_amount: parentUnitAmount,
      },
      component_lines: componentLines,
      fulfillment_groups: {
        digital: digitalLines.map((line) => ({
          component_variant_id: line.component_variant_id,
          quantity: line.quantity,
        })),
        physical: physicalLines.map((line) => ({
          component_variant_id: line.component_variant_id,
          quantity: line.quantity,
        })),
      },
      summary: {
        component_line_count: componentLines.length,
        total_component_quantity: componentLines.reduce(
          (sum, line) => sum + line.quantity,
          0,
        ),
        allocation: {
          parent_unit_amount: parentUnitAmount,
          component_total_per_parent: allocatedComponentTotalPerParent,
          difference_per_parent:
            parentUnitAmount === null || allocatedComponentTotalPerParent === null
              ? null
              : parentUnitAmount - allocatedComponentTotalPerParent,
        },
      },
    };
  }

  async buildBundleOpsContract(input: BuildV2BundleOpsContractInput): Promise<any> {
    const resolved = await this.resolveBundle({
      bundle_definition_id: input.bundle_definition_id,
      parent_variant_id: input.parent_variant_id,
      parent_quantity: input.parent_quantity,
      parent_unit_amount: input.parent_unit_amount,
      selected_components: input.selected_components,
    });

    const componentContracts = (resolved.component_lines as any[]).map((line) => ({
      bundle_component_id_snapshot: line.bundle_component_id_snapshot as string,
      component_variant_id: line.component_variant_id as string,
      component_variant_sku: line.component_variant_sku as string,
      fulfillment_type: line.fulfillment_type as V2FulfillmentType,
      requires_shipping: Boolean(line.requires_shipping),
      quantity: Number(line.quantity ?? 0),
      refund_contract: {
        supported: true,
        basis: 'COMPONENT_LINE',
        quantity_field: 'order_items.quantity',
        amount_fields: [
          'order_items.allocated_unit_amount',
          'order_items.allocated_discount_amount',
        ],
        snapshot_field: 'order_items.bundle_component_id_snapshot',
      },
      reship_contract: {
        supported:
          line.fulfillment_type === 'PHYSICAL' && Boolean(line.requires_shipping),
        basis: 'COMPONENT_LINE',
        quantity_field: 'order_items.quantity',
        snapshot_field: 'order_items.bundle_component_id_snapshot',
      },
      digital_regrant_contract: {
        supported: line.fulfillment_type === 'DIGITAL',
        basis: 'COMPONENT_LINE',
        snapshot_field: 'order_items.bundle_component_id_snapshot',
      },
    }));

    return {
      bundle_definition_id: resolved.bundle_definition_id,
      mode: resolved.mode,
      status: resolved.status,
      policy_version: '2026-03-13.bundle-component-ops.v1',
      parent_line_contract: {
        line_type: 'BUNDLE_PARENT',
        direct_refund_supported: false,
        direct_reship_supported: false,
        reason:
          'parent line은 component 분해 기준의 참조 행이며, CS/환불/재발송은 component line 기준으로 처리합니다',
      },
      component_line_contracts: componentContracts,
      summary: {
        component_line_count: componentContracts.length,
        refundable_component_lines: componentContracts.filter(
          (contract) => contract.refund_contract.supported,
        ).length,
        reshippable_component_lines: componentContracts.filter(
          (contract) => contract.reship_contract.supported,
        ).length,
        digital_regrant_component_lines: componentContracts.filter(
          (contract) => contract.digital_regrant_contract.supported,
        ).length,
      },
    };
  }

  async buildBundleCanaryReport(
    input: BuildV2BundleCanaryReportInput,
  ): Promise<any> {
    const generatedAt = new Date().toISOString();
    const explicitDefinitionIds = Array.isArray(input.definition_ids)
      ? Array.from(
          new Set(
            input.definition_ids
              .map((id) => this.normalizeOptionalText(id))
              .filter((id): id is string => !!id),
          ),
        )
      : [];

    const sampleParentQuantity = input.sample_parent_quantity ?? 1;
    this.assertPositiveInteger(sampleParentQuantity, 'sample_parent_quantity');

    let sampleParentUnitAmount: number | null = null;
    if (
      input.sample_parent_unit_amount !== undefined &&
      input.sample_parent_unit_amount !== null
    ) {
      if (
        !Number.isInteger(input.sample_parent_unit_amount) ||
        input.sample_parent_unit_amount < 0
      ) {
        throw new ApiException(
          'sample_parent_unit_amount는 0 이상의 정수여야 합니다',
          400,
          'VALIDATION_ERROR',
        );
      }
      sampleParentUnitAmount = input.sample_parent_unit_amount;
    }

    let targetDefinitionIds = explicitDefinitionIds;
    let source: 'EXPLICIT' | 'ACTIVE_DEFAULT' = 'EXPLICIT';

    if (targetDefinitionIds.length === 0) {
      source = 'ACTIVE_DEFAULT';
      const { data: activeDefinitions, error } = await this.supabase
        .from('v2_bundle_definitions')
        .select('id')
        .eq('status', 'ACTIVE')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(20);

      if (error) {
        throw new ApiException(
          'canary 대상 bundle definition 조회 실패',
          500,
          'V2_BUNDLE_DEFINITIONS_FETCH_FAILED',
        );
      }

      targetDefinitionIds = ((activeDefinitions || []) as any[]).map(
        (definition) => definition.id as string,
      );
    }

    if (targetDefinitionIds.length === 0) {
      return {
        generated_at: generatedAt,
        source,
        sample_parent_quantity: sampleParentQuantity,
        sample_parent_unit_amount: sampleParentUnitAmount,
        target_count: 0,
        summary: {
          ready_count: 0,
          monitoring_count: 0,
          blocked_count: 0,
        },
        targets: [],
      };
    }

    const targets = [];

    for (const definitionId of targetDefinitionIds) {
      const definition = await this.getBundleDefinitionById(definitionId);
      const validation = await this.validateBundleDefinition(definitionId, {});

      let shadowResolvePass = false;
      let shadowResolveError: string | null = null;
      let shadowAllocationDiff: number | null = null;

      if (validation.ready) {
        try {
          const shadowResolved = await this.resolveBundle({
            bundle_definition_id: definitionId,
            parent_quantity: sampleParentQuantity,
            parent_unit_amount: sampleParentUnitAmount,
            selected_components: [],
          });
          shadowAllocationDiff =
            shadowResolved.summary?.allocation?.difference_per_parent ?? null;
          shadowResolvePass =
            shadowAllocationDiff === null || shadowAllocationDiff === 0;
          if (!shadowResolvePass) {
            shadowResolveError = `allocation difference=${shadowAllocationDiff}`;
          }
        } catch (error) {
          shadowResolveError = this.extractApiExceptionMessage(error);
        }
      } else {
        shadowResolveError = 'validation_not_ready';
      }

      const liveSnapshot = await this.buildBundleCanaryLiveSnapshotSummary(
        definitionId,
      );

      let canaryStatus: 'READY' | 'MONITORING' | 'BLOCKED' = 'BLOCKED';
      if (validation.ready && shadowResolvePass) {
        if (!liveSnapshot.has_live_orders) {
          canaryStatus = 'READY';
        } else if (liveSnapshot.snapshot_integrity_passed === true) {
          canaryStatus = 'MONITORING';
        } else {
          canaryStatus = 'BLOCKED';
        }
      }

      targets.push({
        definition_id: definitionId,
        bundle_product_id: definition.bundle_product_id,
        version_no: definition.version_no,
        status: definition.status,
        mode: definition.mode,
        validation_ready: validation.ready,
        failed_validation_checks: (validation.checks as any[])
          .filter((check) => !check.passed)
          .map((check) => check.key),
        shadow_resolution: {
          pass: shadowResolvePass,
          error: shadowResolveError,
          allocation_difference_per_parent: shadowAllocationDiff,
        },
        live_snapshot: liveSnapshot,
        canary_status: canaryStatus,
      });
    }

    return {
      generated_at: generatedAt,
      source,
      sample_parent_quantity: sampleParentQuantity,
      sample_parent_unit_amount: sampleParentUnitAmount,
      target_count: targets.length,
      summary: {
        ready_count: targets.filter((target) => target.canary_status === 'READY')
          .length,
        monitoring_count: targets.filter(
          (target) => target.canary_status === 'MONITORING',
        ).length,
        blocked_count: targets.filter(
          (target) => target.canary_status === 'BLOCKED',
        ).length,
      },
      targets,
    };
  }

  private async buildBundleCanaryLiveSnapshotSummary(
    definitionId: string,
  ): Promise<{
    has_live_orders: boolean;
    parent_line_count: number;
    component_line_count: number;
    component_missing_parent_ref: number;
    orphan_component_lines: number;
    component_missing_snapshot: number;
    snapshot_integrity_passed: boolean | null;
  }> {
    const components = await this.fetchBundleComponents(definitionId);
    const componentIds = components.map((component) => component.id as string);

    const { data: parentRows, error: parentError } = await this.supabase
      .from('order_items')
      .select(
        'id,order_id,line_type,parent_order_item_id,bundle_definition_id_snapshot,bundle_component_id_snapshot,allocated_unit_amount,allocated_discount_amount',
      )
      .eq('line_type', 'BUNDLE_PARENT')
      .eq('bundle_definition_id_snapshot', definitionId);

    if (parentError) {
      throw new ApiException(
        'canary parent snapshot 조회 실패',
        500,
        'ORDER_ITEMS_FETCH_FAILED',
      );
    }

    let componentRows: any[] = [];
    if (componentIds.length > 0) {
      const { data: fetchedComponentRows, error: componentError } = await this.supabase
        .from('order_items')
        .select(
          'id,order_id,line_type,parent_order_item_id,bundle_definition_id_snapshot,bundle_component_id_snapshot,allocated_unit_amount,allocated_discount_amount',
        )
        .eq('line_type', 'BUNDLE_COMPONENT')
        .in('bundle_component_id_snapshot', componentIds);

      if (componentError) {
        throw new ApiException(
          'canary component snapshot 조회 실패',
          500,
          'ORDER_ITEMS_FETCH_FAILED',
        );
      }

      componentRows = fetchedComponentRows || [];
    }

    const parentIdSet = new Set<string>(
      ((parentRows || []) as any[]).map((row) => row.id as string),
    );
    const componentMissingParentRef = componentRows.filter(
      (row) => !row.parent_order_item_id,
    ).length;
    const orphanComponentLines = componentRows.filter(
      (row) =>
        !!row.parent_order_item_id && !parentIdSet.has(row.parent_order_item_id),
    ).length;
    const componentMissingSnapshot = componentRows.filter(
      (row) => !row.bundle_component_id_snapshot,
    ).length;
    const hasLiveOrders =
      (parentRows || []).length > 0 || componentRows.length > 0;
    const snapshotIntegrityPassed = hasLiveOrders
      ? componentMissingParentRef === 0 &&
        orphanComponentLines === 0 &&
        componentMissingSnapshot === 0
      : null;

    return {
      has_live_orders: hasLiveOrders,
      parent_line_count: (parentRows || []).length,
      component_line_count: componentRows.length,
      component_missing_parent_ref: componentMissingParentRef,
      orphan_component_lines: orphanComponentLines,
      component_missing_snapshot: componentMissingSnapshot,
      snapshot_integrity_passed: snapshotIntegrityPassed,
    };
  }

  private extractApiExceptionMessage(error: unknown): string {
    if (error instanceof ApiException) {
      return error.message;
    }
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof (error as { message?: unknown }).message === 'string'
    ) {
      return (error as { message: string }).message;
    }
    return 'unknown_error';
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

  private resolveMigrationCheckSeverity(
    checkKey: string,
  ): 'BLOCKING' | 'ADVISORY' {
    const advisoryKeys = new Set([
      'active_products_have_primary_media',
      'active_digital_variants_have_ready_assets',
    ]);

    return advisoryKeys.has(checkKey) ? 'ADVISORY' : 'BLOCKING';
  }

  private resolveReadSwitchTaskTitle(checkKey: string): string {
    const titles: Record<string, string> = {
      projects_backfill_complete: '프로젝트 매핑 누락 보정',
      artists_backfill_complete: '아티스트 매핑 누락 보정',
      products_backfill_complete: '상품 매핑 누락 보정',
      project_artist_links_complete: '프로젝트-아티스트 링크 보정',
      product_project_mapping_consistent: '상품-프로젝트 매핑 불일치 보정',
      v2_products_have_variants: '상품 variant 누락 보정',
      active_products_have_primary_media: '활성 상품 primary media 보강',
      digital_variants_have_assets: '디지털 variant asset 보강',
      active_digital_variants_have_ready_assets:
        '활성 디지털 variant READY asset 보강',
    };

    return titles[checkKey] || checkKey;
  }

  private resolveDifferenceSourceByCheckKey(
    checkKey: string,
  ): { group: string; key: string } | null {
    const mapping: Record<string, { group: string; key: string }> = {
      projects_backfill_complete: { group: 'missing_mappings', key: 'projects' },
      artists_backfill_complete: { group: 'missing_mappings', key: 'artists' },
      products_backfill_complete: { group: 'missing_mappings', key: 'products' },
      project_artist_links_complete: {
        group: 'integrity',
        key: 'missing_project_artist_links',
      },
      product_project_mapping_consistent: {
        group: 'data_mismatch',
        key: 'product_project_mapping',
      },
      v2_products_have_variants: {
        group: 'integrity',
        key: 'products_without_variants',
      },
      active_products_have_primary_media: {
        group: 'integrity',
        key: 'active_products_without_primary_media',
      },
      digital_variants_have_assets: {
        group: 'integrity',
        key: 'digital_variants_without_assets',
      },
      active_digital_variants_have_ready_assets: {
        group: 'integrity',
        key: 'active_digital_variants_without_ready_asset',
      },
    };

    return mapping[checkKey] || null;
  }

  private resolveDifferenceSamples(
    differences: Record<string, unknown>,
    group?: string,
    key?: string,
  ): any[] {
    if (!group || !key) {
      return [];
    }

    const groupValue = differences[group];
    if (!groupValue || typeof groupValue !== 'object') {
      return [];
    }

    const sampleValue = (groupValue as Record<string, unknown>)[key];
    return Array.isArray(sampleValue) ? sampleValue : [];
  }

  private async fetchBundleComponents(bundleDefinitionId: string): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('v2_bundle_components')
      .select('*')
      .eq('bundle_definition_id', bundleDefinitionId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true });

    if (error) {
      throw new ApiException(
        'bundle component 목록 조회 실패',
        500,
        'V2_BUNDLE_COMPONENTS_FETCH_FAILED',
      );
    }

    return data || [];
  }

  private async getBundleComponentById(componentId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_bundle_components')
      .select('*')
      .eq('id', componentId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'bundle component 조회 실패',
        500,
        'V2_BUNDLE_COMPONENT_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'bundle component를 찾을 수 없습니다',
        404,
        'V2_BUNDLE_COMPONENT_NOT_FOUND',
      );
    }

    return data;
  }

  private async getBundleComponentOptionById(optionId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_bundle_component_options')
      .select('*')
      .eq('id', optionId)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'bundle component option 조회 실패',
        500,
        'V2_BUNDLE_COMPONENT_OPTION_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'bundle component option을 찾을 수 없습니다',
        404,
        'V2_BUNDLE_COMPONENT_OPTION_NOT_FOUND',
      );
    }

    return data;
  }

  private async getNextBundleDefinitionVersion(
    bundleProductId: string,
  ): Promise<number> {
    const { data, error } = await this.supabase
      .from('v2_bundle_definitions')
      .select('version_no')
      .eq('bundle_product_id', bundleProductId)
      .order('version_no', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'bundle definition version 조회 실패',
        500,
        'V2_BUNDLE_DEFINITION_FETCH_FAILED',
      );
    }

    return (data?.version_no ?? 0) + 1;
  }

  private async assertBundleDefinitionVersionAvailable(
    bundleProductId: string,
    versionNo: number,
  ): Promise<void> {
    const { data, error } = await this.supabase
      .from('v2_bundle_definitions')
      .select('id')
      .eq('bundle_product_id', bundleProductId)
      .eq('version_no', versionNo)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'bundle definition version 중복 검사 실패',
        500,
        'V2_BUNDLE_DEFINITION_FETCH_FAILED',
      );
    }
    if (data) {
      throw new ApiException(
        '이미 사용 중인 bundle version입니다',
        409,
        'V2_BUNDLE_DEFINITION_VERSION_EXISTS',
      );
    }
  }

  private async assertBundleComponentVariantAllowed(variant: any): Promise<void> {
    const product = await this.getProductById(variant.product_id as string);
    if (product.product_kind === 'BUNDLE') {
      throw new ApiException(
        '1차 rollout에서는 BUNDLE을 component로 중첩할 수 없습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    if (variant.status === 'INACTIVE') {
      throw new ApiException(
        'INACTIVE variant는 bundle component로 사용할 수 없습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private normalizeBundleSelectionMap(
    selections: BundleComponentSelectionInput[] | undefined,
  ): Map<string, number> {
    const result = new Map<string, number>();
    if (!selections || selections.length === 0) {
      return result;
    }

    for (const selection of selections) {
      const variantId = this.normalizeRequiredText(
        selection.component_variant_id,
        'selected_components.component_variant_id는 필수입니다',
      );
      const quantity = selection.quantity ?? 0;
      if (!Number.isInteger(quantity) || quantity < 0) {
        throw new ApiException(
          'selected_components.quantity는 0 이상의 정수여야 합니다',
          400,
          'VALIDATION_ERROR',
        );
      }
      result.set(variantId, quantity);
    }

    return result;
  }

  private assertBundleMode(value: string): void {
    const allowed: V2BundleMode[] = ['FIXED', 'CUSTOMIZABLE'];
    if (!allowed.includes(value as V2BundleMode)) {
      throw new ApiException(
        'bundle mode 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertBundleStatus(value: string): void {
    const allowed: V2BundleStatus[] = ['DRAFT', 'ACTIVE', 'ARCHIVED'];
    if (!allowed.includes(value as V2BundleStatus)) {
      throw new ApiException(
        'bundle status 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertBundlePricingStrategy(value: string): void {
    const allowed: V2BundlePricingStrategy[] = ['WEIGHTED', 'FIXED_AMOUNT'];
    if (!allowed.includes(value as V2BundlePricingStrategy)) {
      throw new ApiException(
        'bundle pricing_strategy 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertBundleStatusTransition(
    current: V2BundleStatus,
    next: V2BundleStatus,
  ): void {
    const allowed: Record<V2BundleStatus, V2BundleStatus[]> = {
      DRAFT: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
      ACTIVE: ['ACTIVE', 'DRAFT', 'ARCHIVED'],
      ARCHIVED: ['ARCHIVED'],
    };
    if (!allowed[current].includes(next)) {
      throw new ApiException(
        `허용되지 않는 bundle 상태 전이입니다: ${current} -> ${next}`,
        400,
        'INVALID_STATUS_TRANSITION',
      );
    }
  }

  private assertBundleDefinitionEditable(status: V2BundleStatus): void {
    if (status === 'ACTIVE') {
      throw new ApiException(
        'ACTIVE bundle definition은 직접 수정할 수 없습니다. clone-version으로 신규 DRAFT 버전을 생성해 수정하세요',
        400,
        'INVALID_STATUS_TRANSITION',
      );
    }
    if (status === 'ARCHIVED') {
      throw new ApiException(
        'ARCHIVED bundle definition은 수정할 수 없습니다',
        400,
        'INVALID_STATUS_TRANSITION',
      );
    }
  }

  private assertBundleComponentQuantityRange(
    minQuantity: number,
    maxQuantity: number,
    defaultQuantity: number,
  ): void {
    if (
      !Number.isInteger(minQuantity) ||
      !Number.isInteger(maxQuantity) ||
      !Number.isInteger(defaultQuantity) ||
      minQuantity < 0 ||
      maxQuantity < 1 ||
      minQuantity > maxQuantity ||
      defaultQuantity < minQuantity ||
      defaultQuantity > maxQuantity
    ) {
      throw new ApiException(
        'bundle component 수량(min/max/default) 범위가 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertNonNegativeNumber(value: number, errorMessage: string): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new ApiException(errorMessage, 400, 'VALIDATION_ERROR');
    }
  }

  private allocateAmountByWeights(totalAmount: number, weights: number[]): number[] {
    if (weights.length === 0) {
      return [];
    }
    const normalizedWeights = weights.map((weight) => (weight > 0 ? weight : 0));
    const totalWeight = normalizedWeights.reduce((sum, weight) => sum + weight, 0);

    if (totalWeight <= 0) {
      const base = Math.floor(totalAmount / weights.length);
      let remainder = totalAmount - base * weights.length;
      return weights.map(() => {
        if (remainder > 0) {
          remainder -= 1;
          return base + 1;
        }
        return base;
      });
    }

    const rawAllocations = normalizedWeights.map(
      (weight) => (totalAmount * weight) / totalWeight,
    );
    const floored = rawAllocations.map((value) => Math.floor(value));
    let remainder =
      totalAmount - floored.reduce((sum, allocation) => sum + allocation, 0);

    const order = rawAllocations
      .map((value, index) => ({
        index,
        fraction: value - Math.floor(value),
      }))
      .sort((a, b) => b.fraction - a.fraction);

    let orderIndex = 0;
    while (remainder > 0 && order.length > 0) {
      const target = order[orderIndex % order.length];
      floored[target.index] += 1;
      remainder -= 1;
      orderIndex += 1;
    }

    return floored;
  }

  private async assertCampaignCodeAvailable(
    code: string,
    excludeCampaignId?: string,
  ): Promise<void> {
    let query = this.supabase
      .from('v2_campaigns')
      .select('id')
      .eq('code', code)
      .is('deleted_at', null);

    if (excludeCampaignId) {
      query = query.neq('id', excludeCampaignId);
    }

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) {
      throw new ApiException(
        'campaign code 중복 검사 실패',
        500,
        'V2_CAMPAIGN_FETCH_FAILED',
      );
    }
    if (data) {
      throw new ApiException(
        '이미 사용 중인 campaign code입니다',
        409,
        'CODE_ALREADY_EXISTS',
      );
    }
  }

  private async getCampaignTargetById(targetId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_campaign_targets')
      .select('*')
      .eq('id', targetId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'campaign target 조회 실패',
        500,
        'V2_CAMPAIGN_TARGET_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'campaign target을 찾을 수 없습니다',
        404,
        'V2_CAMPAIGN_TARGET_NOT_FOUND',
      );
    }

    return data;
  }

  private async ensureCampaignTargetEntityExists(
    targetType: V2CampaignTargetType,
    targetId: string,
  ): Promise<void> {
    if (targetType === 'PROJECT') {
      await this.ensureProjectExists(targetId);
      return;
    }
    if (targetType === 'PRODUCT') {
      await this.ensureProductExists(targetId);
      return;
    }
    if (targetType === 'VARIANT') {
      await this.ensureVariantExists(targetId);
      return;
    }
    if (targetType === 'BUNDLE_DEFINITION') {
      await this.getBundleDefinitionById(targetId);
      return;
    }
    throw new ApiException('지원하지 않는 target_type입니다', 400, 'VALIDATION_ERROR');
  }

  private async getPriceListItemById(itemId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_price_list_items')
      .select('*')
      .eq('id', itemId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'price list item 조회 실패',
        500,
        'V2_PRICE_LIST_ITEM_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'price list item을 찾을 수 없습니다',
        404,
        'V2_PRICE_LIST_ITEM_NOT_FOUND',
      );
    }

    return data;
  }

  private async getPromotionRuleById(ruleId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_promotion_rules')
      .select('*')
      .eq('id', ruleId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'promotion rule 조회 실패',
        500,
        'V2_PROMOTION_RULE_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'promotion rule을 찾을 수 없습니다',
        404,
        'V2_PROMOTION_RULE_NOT_FOUND',
      );
    }

    return data;
  }

  private async assertCouponCodeAvailable(
    code: string,
    excludeCouponId?: string,
  ): Promise<void> {
    let query = this.supabase
      .from('v2_coupons')
      .select('id')
      .eq('code', code)
      .is('deleted_at', null);
    if (excludeCouponId) {
      query = query.neq('id', excludeCouponId);
    }

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) {
      throw new ApiException(
        'coupon code 중복 검사 실패',
        500,
        'V2_COUPON_FETCH_FAILED',
      );
    }
    if (data) {
      throw new ApiException(
        '이미 사용 중인 coupon code입니다',
        409,
        'CODE_ALREADY_EXISTS',
      );
    }
  }

  private async getCouponRedemptionById(redemptionId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_coupon_redemptions')
      .select('*')
      .eq('id', redemptionId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'coupon redemption 조회 실패',
        500,
        'V2_COUPON_REDEMPTION_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'coupon redemption을 찾을 수 없습니다',
        404,
        'V2_COUPON_REDEMPTION_NOT_FOUND',
      );
    }

    return data;
  }

  private assertCampaignType(value: string): void {
    const allowed: V2CampaignType[] = ['POPUP', 'EVENT', 'SALE', 'DROP', 'ALWAYS_ON'];
    if (!allowed.includes(value as V2CampaignType)) {
      throw new ApiException(
        'campaign_type 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertCampaignStatus(value: string): void {
    const allowed: V2CampaignStatus[] = [
      'DRAFT',
      'ACTIVE',
      'SUSPENDED',
      'CLOSED',
      'ARCHIVED',
    ];
    if (!allowed.includes(value as V2CampaignStatus)) {
      throw new ApiException(
        'campaign status 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertCampaignStatusTransition(
    current: V2CampaignStatus,
    next: V2CampaignStatus,
  ): void {
    const allowed: Record<V2CampaignStatus, V2CampaignStatus[]> = {
      DRAFT: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
      ACTIVE: ['ACTIVE', 'SUSPENDED', 'CLOSED', 'ARCHIVED'],
      SUSPENDED: ['SUSPENDED', 'ACTIVE', 'CLOSED', 'ARCHIVED'],
      CLOSED: ['CLOSED', 'ACTIVE', 'ARCHIVED'],
      ARCHIVED: ['ARCHIVED'],
    };
    if (!allowed[current].includes(next)) {
      throw new ApiException(
        `허용되지 않는 campaign 상태 전이입니다: ${current} -> ${next}`,
        400,
        'INVALID_STATUS_TRANSITION',
      );
    }
  }

  private assertCampaignTargetType(value: string): void {
    const allowed: V2CampaignTargetType[] = [
      'PROJECT',
      'PRODUCT',
      'VARIANT',
      'BUNDLE_DEFINITION',
    ];
    if (!allowed.includes(value as V2CampaignTargetType)) {
      throw new ApiException(
        'campaign target_type 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertPriceListScope(value: string): void {
    const allowed: V2PriceListScope[] = ['BASE', 'OVERRIDE'];
    if (!allowed.includes(value as V2PriceListScope)) {
      throw new ApiException(
        'price list scope_type 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private resolvePriceListScopeForCampaign(
    campaign: any,
    requestedScope: V2PriceListScope | undefined,
  ): V2PriceListScope {
    const expectedScope: V2PriceListScope =
      campaign?.campaign_type === 'ALWAYS_ON' ? 'BASE' : 'OVERRIDE';
    if (requestedScope && requestedScope !== expectedScope) {
      throw new ApiException(
        `campaign 유형(${campaign?.campaign_type})에는 ${expectedScope} scope만 허용됩니다`,
        400,
        'VALIDATION_ERROR',
      );
    }
    return expectedScope;
  }

  private assertPriceListStatus(value: string): void {
    const allowed: V2PriceListStatus[] = [
      'DRAFT',
      'PUBLISHED',
      'ROLLED_BACK',
      'ARCHIVED',
    ];
    if (!allowed.includes(value as V2PriceListStatus)) {
      throw new ApiException(
        'price list status 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertPriceListStatusTransition(
    current: V2PriceListStatus,
    next: V2PriceListStatus,
  ): void {
    const allowed: Record<V2PriceListStatus, V2PriceListStatus[]> = {
      DRAFT: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
      PUBLISHED: ['PUBLISHED', 'ROLLED_BACK', 'ARCHIVED'],
      ROLLED_BACK: ['ROLLED_BACK', 'PUBLISHED', 'ARCHIVED'],
      ARCHIVED: ['ARCHIVED'],
    };
    if (!allowed[current].includes(next)) {
      throw new ApiException(
        `허용되지 않는 price list 상태 전이입니다: ${current} -> ${next}`,
        400,
        'INVALID_STATUS_TRANSITION',
      );
    }
  }

  private assertPriceItemStatus(value: string): void {
    const allowed: V2PriceItemStatus[] = ['ACTIVE', 'INACTIVE'];
    if (!allowed.includes(value as V2PriceItemStatus)) {
      throw new ApiException(
        'price item status 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertPromotionType(value: string): void {
    const allowed: V2PromotionType[] = [
      'ITEM_PERCENT',
      'ITEM_FIXED',
      'ORDER_PERCENT',
      'ORDER_FIXED',
      'SHIPPING_PERCENT',
      'SHIPPING_FIXED',
    ];
    if (!allowed.includes(value as V2PromotionType)) {
      throw new ApiException(
        'promotion_type 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertPromotionStatus(value: string): void {
    const allowed: V2PromotionStatus[] = ['DRAFT', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'];
    if (!allowed.includes(value as V2PromotionStatus)) {
      throw new ApiException(
        'promotion status 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertPromotionStatusTransition(
    current: V2PromotionStatus,
    next: V2PromotionStatus,
  ): void {
    const allowed: Record<V2PromotionStatus, V2PromotionStatus[]> = {
      DRAFT: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
      ACTIVE: ['ACTIVE', 'SUSPENDED', 'ARCHIVED'],
      SUSPENDED: ['SUSPENDED', 'ACTIVE', 'ARCHIVED'],
      ARCHIVED: ['ARCHIVED'],
    };
    if (!allowed[current].includes(next)) {
      throw new ApiException(
        `허용되지 않는 promotion 상태 전이입니다: ${current} -> ${next}`,
        400,
        'INVALID_STATUS_TRANSITION',
      );
    }
  }

  private assertCombinabilityMode(value: string): void {
    const allowed: V2CombinabilityMode[] = ['STACKABLE', 'EXCLUSIVE'];
    if (!allowed.includes(value as V2CombinabilityMode)) {
      throw new ApiException(
        'combinability_mode 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertPromotionRuleType(value: string): void {
    const allowed: V2PromotionRuleType[] = [
      'MIN_ORDER_AMOUNT',
      'MIN_ITEM_QUANTITY',
      'TARGET_PROJECT',
      'TARGET_PRODUCT',
      'TARGET_VARIANT',
      'TARGET_BUNDLE',
      'CHANNEL',
      'USER_SEGMENT',
    ];
    if (!allowed.includes(value as V2PromotionRuleType)) {
      throw new ApiException(
        'promotion rule_type 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertCouponStatus(value: string): void {
    const allowed: V2CouponStatus[] = [
      'DRAFT',
      'ACTIVE',
      'PAUSED',
      'EXHAUSTED',
      'EXPIRED',
      'ARCHIVED',
    ];
    if (!allowed.includes(value as V2CouponStatus)) {
      throw new ApiException(
        'coupon status 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertCouponStatusTransition(
    current: V2CouponStatus,
    next: V2CouponStatus,
  ): void {
    const allowed: Record<V2CouponStatus, V2CouponStatus[]> = {
      DRAFT: ['DRAFT', 'ACTIVE', 'ARCHIVED'],
      ACTIVE: ['ACTIVE', 'PAUSED', 'EXHAUSTED', 'EXPIRED', 'ARCHIVED'],
      PAUSED: ['PAUSED', 'ACTIVE', 'EXPIRED', 'ARCHIVED'],
      EXHAUSTED: ['EXHAUSTED', 'ARCHIVED'],
      EXPIRED: ['EXPIRED', 'ARCHIVED'],
      ARCHIVED: ['ARCHIVED'],
    };
    if (!allowed[current].includes(next)) {
      throw new ApiException(
        `허용되지 않는 coupon 상태 전이입니다: ${current} -> ${next}`,
        400,
        'INVALID_STATUS_TRANSITION',
      );
    }
  }

  private assertCouponRedemptionStatus(value: string): void {
    const allowed: V2CouponRedemptionStatus[] = [
      'RESERVED',
      'APPLIED',
      'RELEASED',
      'CANCELED',
      'EXPIRED',
    ];
    if (!allowed.includes(value as V2CouponRedemptionStatus)) {
      throw new ApiException(
        'coupon redemption status 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertPurchaseQuantityRange(
    minPurchaseQuantity: number,
    maxPurchaseQuantity?: number | null,
  ): void {
    if (!Number.isInteger(minPurchaseQuantity) || minPurchaseQuantity <= 0) {
      throw new ApiException(
        'min_purchase_quantity는 1 이상의 정수여야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    if (maxPurchaseQuantity === undefined || maxPurchaseQuantity === null) {
      return;
    }
    if (
      !Number.isInteger(maxPurchaseQuantity) ||
      maxPurchaseQuantity < minPurchaseQuantity
    ) {
      throw new ApiException(
        'max_purchase_quantity는 min_purchase_quantity 이상 정수여야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private normalizeCurrencyCode(value: string): string {
    const normalized = value.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalized)) {
      throw new ApiException(
        'currency_code는 3자리 ISO 코드여야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    return normalized;
  }

  private normalizeOptionalTimestamp(
    value: string | null | undefined,
    fieldName: string,
  ): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      throw new ApiException(
        `${fieldName}는 유효한 ISO timestamp여야 합니다`,
        400,
        'VALIDATION_ERROR',
      );
    }
    return parsed.toISOString();
  }

  private normalizeOptionalInteger(
    value: number | null | undefined,
    fieldName: string,
  ): number | null {
    if (value === undefined || value === null) {
      return null;
    }
    if (!Number.isInteger(value) || value < 0) {
      throw new ApiException(
        `${fieldName}는 0 이상의 정수여야 합니다`,
        400,
        'VALIDATION_ERROR',
      );
    }
    return value;
  }

  private assertDateRange(
    startsAt: string | null | undefined,
    endsAt: string | null | undefined,
    label: string,
  ): void {
    if (!startsAt || !endsAt) {
      return;
    }
    if (new Date(startsAt).getTime() > new Date(endsAt).getTime()) {
      throw new ApiException(
        `${label} starts_at은 ends_at보다 같거나 빨라야 합니다`,
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private normalizeOptionalArrayJson(value: unknown): unknown[] {
    if (value === undefined || value === null) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new ApiException(
        'JSON 배열 형식이 필요합니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    return value;
  }

  private normalizeOptionalObjectJson(value: unknown): Record<string, unknown> {
    if (value === undefined || value === null) {
      return {};
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new ApiException(
        'JSON 객체 형식이 필요합니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    return value as Record<string, unknown>;
  }

  private isTimestampInRange(
    startsAt: string | null | undefined,
    endsAt: string | null | undefined,
    nowIso: string,
  ): boolean {
    const now = new Date(nowIso).getTime();
    if (startsAt && new Date(startsAt).getTime() > now) {
      return false;
    }
    if (endsAt && new Date(endsAt).getTime() < now) {
      return false;
    }
    return true;
  }

  private matchesChannelScope(
    scopeValue: unknown,
    channel: string | null | undefined,
  ): boolean {
    if (!scopeValue) {
      return true;
    }
    if (!Array.isArray(scopeValue)) {
      return true;
    }
    if (scopeValue.length === 0) {
      return true;
    }
    if (!channel) {
      return false;
    }
    const upperChannel = channel.trim().toUpperCase();
    const normalized = scopeValue
      .map((item) => (typeof item === 'string' ? item.toUpperCase() : null))
      .filter((item): item is string => !!item);
    return normalized.includes('ALL') || normalized.includes(upperChannel);
  }

  private pickBestPriceItem(items: any[]): any | null {
    if (!items || items.length === 0) {
      return null;
    }
    const sorted = [...items].sort((a, b) => {
      const priorityDiff = (b.price_list?.priority ?? 0) - (a.price_list?.priority ?? 0);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      const publishedA = a.price_list?.published_at
        ? new Date(a.price_list.published_at).getTime()
        : 0;
      const publishedB = b.price_list?.published_at
        ? new Date(b.price_list.published_at).getTime()
        : 0;
      if (publishedA !== publishedB) {
        return publishedB - publishedA;
      }
      const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return createdB - createdA;
    });
    return sorted[0];
  }

  private isCampaignApplicableForShopPricing(
    campaign: any,
    evaluatedAt: string,
    channel: string | null,
  ): boolean {
    if (!campaign || typeof campaign !== 'object') {
      return true;
    }
    if (campaign.deleted_at) {
      return false;
    }
    if (campaign.status !== 'ACTIVE') {
      return false;
    }
    if (!this.isTimestampInRange(campaign.starts_at, campaign.ends_at, evaluatedAt)) {
      return false;
    }
    return this.matchesChannelScope(campaign.channel_scope_json, channel);
  }

  private createEmptyCampaignTargetEligibilityBucket(): CampaignTargetEligibilityBucket {
    return {
      projectIds: new Set<string>(),
      productIds: new Set<string>(),
      variantIds: new Set<string>(),
    };
  }

  private createEmptyCampaignTargetEligibilityScope(): CampaignTargetEligibilityScope {
    return {
      include: this.createEmptyCampaignTargetEligibilityBucket(),
      exclude: this.createEmptyCampaignTargetEligibilityBucket(),
      hasIncludeTargets: false,
    };
  }

  private extractCampaignTargetProductIdFromSnapshot(snapshot: unknown): string | null {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return null;
    }

    const payload = snapshot as Record<string, unknown>;
    const productId = this.normalizeOptionalText(payload.product_id as string | null | undefined);
    if (productId) {
      return productId;
    }
    const bundleProductId = this.normalizeOptionalText(
      payload.bundle_product_id as string | null | undefined,
    );
    if (bundleProductId) {
      return bundleProductId;
    }
    const targetProductId = this.normalizeOptionalText(
      payload.target_product_id as string | null | undefined,
    );
    if (targetProductId) {
      return targetProductId;
    }

    return null;
  }

  private applyCampaignTargetToEligibilityBucket(params: {
    bucket: CampaignTargetEligibilityBucket;
    targetType: V2CampaignTargetType;
    targetId: string;
    sourceSnapshot: unknown;
  }): void {
    if (params.targetType === 'PROJECT') {
      params.bucket.projectIds.add(params.targetId);
      return;
    }
    if (params.targetType === 'PRODUCT') {
      params.bucket.productIds.add(params.targetId);
      return;
    }
    if (params.targetType === 'VARIANT') {
      params.bucket.variantIds.add(params.targetId);
      return;
    }
    if (params.targetType === 'BUNDLE_DEFINITION') {
      const bundleProductId = this.extractCampaignTargetProductIdFromSnapshot(
        params.sourceSnapshot,
      );
      if (bundleProductId) {
        params.bucket.productIds.add(bundleProductId);
      }
    }
  }

  private async loadCampaignTargetEligibilityByCampaignIds(
    campaignIds: Array<string | null | undefined>,
  ): Promise<Map<string, CampaignTargetEligibilityScope>> {
    const normalizedCampaignIds = Array.from(
      new Set(
        campaignIds
          .map((campaignId) => this.normalizeOptionalText(campaignId))
          .filter((campaignId): campaignId is string => !!campaignId),
      ),
    );

    const eligibilityByCampaignId = new Map<string, CampaignTargetEligibilityScope>();
    if (normalizedCampaignIds.length === 0) {
      return eligibilityByCampaignId;
    }

    normalizedCampaignIds.forEach((campaignId) => {
      eligibilityByCampaignId.set(
        campaignId,
        this.createEmptyCampaignTargetEligibilityScope(),
      );
    });

    const { data, error } = await this.supabase
      .from('v2_campaign_targets')
      .select('campaign_id,target_type,target_id,is_excluded,source_snapshot_json')
      .in('campaign_id', normalizedCampaignIds)
      .is('deleted_at', null);

    if (error) {
      throw new ApiException(
        'shop pricing campaign target 조회 실패',
        500,
        'V2_CAMPAIGN_TARGETS_FETCH_FAILED',
      );
    }

    for (const row of data || []) {
      const campaignId = this.normalizeOptionalText(
        row.campaign_id as string | null | undefined,
      );
      const targetType = row.target_type as V2CampaignTargetType | null;
      const targetId = this.normalizeOptionalText(
        row.target_id as string | null | undefined,
      );
      if (!campaignId || !targetType || !targetId) {
        continue;
      }

      const scope =
        eligibilityByCampaignId.get(campaignId) ??
        this.createEmptyCampaignTargetEligibilityScope();
      const isExcluded = (row.is_excluded as boolean | null | undefined) ?? false;
      const bucket = isExcluded ? scope.exclude : scope.include;
      this.applyCampaignTargetToEligibilityBucket({
        bucket,
        targetType,
        targetId,
        sourceSnapshot: row.source_snapshot_json,
      });
      if (!isExcluded) {
        scope.hasIncludeTargets = true;
      }
      eligibilityByCampaignId.set(campaignId, scope);
    }

    return eligibilityByCampaignId;
  }

  private isCampaignTargetEligibleForShopPricing(params: {
    campaignId: string | null | undefined;
    projectId: string | null | undefined;
    productId: string;
    variantId: string | null;
    campaignTargetEligibilityByCampaignId: Map<
      string,
      CampaignTargetEligibilityScope
    >;
  }): boolean {
    const campaignId = this.normalizeOptionalText(params.campaignId);
    if (!campaignId) {
      return false;
    }

    const eligibility = params.campaignTargetEligibilityByCampaignId.get(campaignId);
    if (!eligibility || !eligibility.hasIncludeTargets) {
      return false;
    }

    const projectId = this.normalizeOptionalText(params.projectId);
    const includedByProject = !!projectId && eligibility.include.projectIds.has(projectId);
    const includedByProduct = eligibility.include.productIds.has(params.productId);
    const includedByVariant =
      !!params.variantId && eligibility.include.variantIds.has(params.variantId);
    const included = includedByProject || includedByProduct || includedByVariant;
    if (!included) {
      return false;
    }

    const excludedByProject = !!projectId && eligibility.exclude.projectIds.has(projectId);
    const excludedByProduct = eligibility.exclude.productIds.has(params.productId);
    const excludedByVariant =
      !!params.variantId && eligibility.exclude.variantIds.has(params.variantId);
    if (excludedByProject || excludedByProduct || excludedByVariant) {
      return false;
    }

    return true;
  }

  private filterShopPriceCandidates(params: {
    productId: string;
    projectId: string | null;
    variantId: string;
    priceItems: any[];
    evaluatedAt: string;
    channel: string | null;
    campaignTargetEligibilityByCampaignId: Map<
      string,
      CampaignTargetEligibilityScope
    >;
  }): any[] {
    return (params.priceItems || [])
      .filter((item) => item.product_id === params.productId)
      .filter(
        (item) => item.variant_id === params.variantId || item.variant_id === null,
      )
      .filter((item) =>
        this.isTimestampInRange(item.starts_at, item.ends_at, params.evaluatedAt),
      )
      .filter((item) => {
        const priceList = item.price_list;
        if (!priceList || priceList.deleted_at) {
          return false;
        }
        if (priceList.status !== 'PUBLISHED') {
          return false;
        }
        const linkedCampaignId = this.normalizeOptionalText(
          priceList.campaign_id as string | null | undefined,
        );
        if (
          !linkedCampaignId &&
          !this.isTimestampInRange(
            priceList.starts_at,
            priceList.ends_at,
            params.evaluatedAt,
          )
        ) {
          return false;
        }
        if (!this.matchesChannelScope(priceList.channel_scope_json, params.channel)) {
          return false;
        }
        if (!this.matchesChannelScope(item.channel_scope_json, params.channel)) {
          return false;
        }

        const linkedCampaign = priceList.campaign;
        if (
          !this.isCampaignApplicableForShopPricing(
            linkedCampaign,
            params.evaluatedAt,
            params.channel,
          )
        ) {
          return false;
        }

        return this.isCampaignTargetEligibleForShopPricing({
          campaignId: priceList.campaign_id as string | null | undefined,
          projectId: params.projectId,
          productId: params.productId,
          variantId: params.variantId,
          campaignTargetEligibilityByCampaignId:
            params.campaignTargetEligibilityByCampaignId,
        });
      });
  }

  private isBasePriceItemCandidate(params: {
    item: any;
    evaluatedAt: string;
    channel: string | null;
  }): boolean {
    const priceList = params.item?.price_list;
    if (!priceList || priceList.scope_type !== 'BASE') {
      return false;
    }

    // 상점 노출 기준은 "상시 운영(ALWAYS_ON) 캠페인에 연결된 BASE"만 허용한다.
    if (!priceList.campaign_id) {
      return false;
    }

    const linkedCampaign = priceList.campaign;
    if (!linkedCampaign || typeof linkedCampaign !== 'object') {
      return false;
    }
    if (linkedCampaign.campaign_type !== 'ALWAYS_ON') {
      return false;
    }

    return this.isCampaignApplicableForShopPricing(
      linkedCampaign,
      params.evaluatedAt,
      params.channel,
    );
  }

  private isOverridePriceItemCandidate(params: {
    item: any;
    campaignId: string | null;
    evaluatedAt: string;
    channel: string | null;
  }): boolean {
    const priceList = params.item?.price_list;
    if (!priceList || priceList.scope_type !== 'OVERRIDE') {
      return false;
    }

    const linkedCampaign = priceList.campaign;

    if (params.campaignId) {
      if (!priceList.campaign_id || priceList.campaign_id !== params.campaignId) {
        return false;
      }
      if (!linkedCampaign || typeof linkedCampaign !== 'object') {
        return false;
      }
      return this.isCampaignApplicableForShopPricing(
        linkedCampaign,
        params.evaluatedAt,
        params.channel,
      );
    }

    if (!priceList.campaign_id) {
      return false;
    }

    if (!linkedCampaign || typeof linkedCampaign !== 'object') {
      return false;
    }
    if (linkedCampaign.campaign_type === 'ALWAYS_ON') {
      return false;
    }

    return this.isCampaignApplicableForShopPricing(
      linkedCampaign,
      params.evaluatedAt,
      params.channel,
    );
  }

  private getOverrideCampaignStartMs(item: any): number {
    const candidateStart =
      item?.price_list?.campaign?.starts_at ??
      item?.price_list?.starts_at ??
      item?.starts_at ??
      null;
    if (!candidateStart) {
      return 0;
    }
    const parsed = new Date(candidateStart).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private pickBestOverridePriceItemStrict(items: any[]): any | null {
    if (!items || items.length === 0) {
      return null;
    }

    const sorted = [...items].sort((a, b) => {
      const startDiff = this.getOverrideCampaignStartMs(b) - this.getOverrideCampaignStartMs(a);
      if (startDiff !== 0) {
        return startDiff;
      }
      const priorityDiff = (b.price_list?.priority ?? 0) - (a.price_list?.priority ?? 0);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      const publishedA = a.price_list?.published_at
        ? new Date(a.price_list.published_at).getTime()
        : 0;
      const publishedB = b.price_list?.published_at
        ? new Date(b.price_list.published_at).getTime()
        : 0;
      if (publishedA !== publishedB) {
        return publishedB - publishedA;
      }
      const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return createdB - createdA;
    });

    return sorted[0] ?? null;
  }

  private buildShopPriceSelectionFromCandidates(params: {
    candidates: any[];
    campaignId: string | null;
    evaluatedAt: string;
    channel: string | null;
  }): { selected: any | null; base: any | null; override: any | null } {
    const base = this.pickBestPriceItem(
      params.candidates.filter((item) =>
        this.isBasePriceItemCandidate({
          item,
          evaluatedAt: params.evaluatedAt,
          channel: params.channel,
        }),
      ),
    );
    const overrideCandidates = params.candidates.filter((item) =>
      this.isOverridePriceItemCandidate({
        item,
        campaignId: params.campaignId,
        evaluatedAt: params.evaluatedAt,
        channel: params.channel,
      }),
    );
    const override = params.campaignId
      ? this.pickBestPriceItem(overrideCandidates)
      : this.pickBestOverridePriceItemStrict(overrideCandidates);

    return {
      selected: override || base,
      base,
      override,
    };
  }

  private async buildShopListItems(
    products: any[],
    context: {
      channel: string | null;
      campaignId: string | null;
      evaluatedAt: string;
    },
  ): Promise<any[]> {
    if (!products || products.length === 0) {
      return [];
    }

    const productIds = products.map((product) => product.id as string);
    const {
      variantsByProductId,
      mediaByProductId,
      inventoryByVariantId,
      priceItems,
      campaignTargetEligibilityByCampaignId,
      projectStatusById,
    } = await this.loadShopContext(
      productIds,
      products.map((product) => product.project_id as string | null),
    );

    return products.map((product) => {
      const productId = product.id as string;
      const projectStatus = this.resolveShopProjectStatus(
        product.project_id as string | null,
        projectStatusById,
      );
      const isProjectActive = projectStatus === 'ACTIVE';
      const variants = variantsByProductId.get(productId) || [];
      const primaryVariant = variants[0] || null;
      const media = mediaByProductId.get(productId) || [];
      const primaryMedia = this.pickPrimaryShopMedia(media);
      const priceSelection =
        primaryVariant && isProjectActive
          ? this.selectShopPriceItem({
              productId,
              projectId: product.project_id as string | null,
              variantId: primaryVariant.id as string,
              priceItems,
              evaluatedAt: context.evaluatedAt,
              campaignId: context.campaignId,
              channel: context.channel,
              campaignTargetEligibilityByCampaignId,
            })
          : { selected: null, base: null, override: null };
      const inventoryQuantity = primaryVariant?.track_inventory
        ? (inventoryByVariantId.get(primaryVariant.id as string) ?? null)
        : null;
      const availability = this.buildShopAvailability({
        projectStatus,
        productStatus: product.status as V2ProductStatus,
        variant: primaryVariant,
        selectedPriceItem: priceSelection.selected,
        inventoryQuantity,
      });

      return {
        product_id: product.id,
        project_id: product.project_id,
        product_kind: product.product_kind,
        title: product.title,
        slug: product.slug,
        short_description: product.short_description,
        thumbnail_url: primaryMedia?.public_url ?? null,
        primary_variant_id: primaryVariant?.id ?? null,
        primary_variant_title: primaryVariant?.title ?? null,
        fulfillment_type: primaryVariant?.fulfillment_type ?? null,
        display_price: priceSelection.selected
          ? {
              amount: priceSelection.selected.unit_amount,
              compare_at_amount: priceSelection.selected.compare_at_amount,
              currency_code: priceSelection.selected.price_list?.currency_code ?? 'KRW',
              source:
                priceSelection.selected.price_list?.scope_type === 'OVERRIDE'
                  ? 'OVERRIDE'
                  : 'BASE',
            }
          : null,
        availability,
      };
    });
  }

  private async loadShopContext(
    productIds: string[],
    inputProjectIds: Array<string | null> = [],
  ): Promise<{
    variantsByProductId: Map<string, any[]>;
    mediaByProductId: Map<string, any[]>;
    inventoryByVariantId: Map<string, number>;
    priceItems: any[];
    projectStatusById: Map<string, V2ProjectStatus>;
    campaignTargetEligibilityByCampaignId: Map<
      string,
      CampaignTargetEligibilityScope
    >;
  }> {
    const variantsByProductId = new Map<string, any[]>();
    const mediaByProductId = new Map<string, any[]>();
    const inventoryByVariantId = new Map<string, number>();
    const projectStatusById = new Map<string, V2ProjectStatus>();
    const campaignTargetEligibilityByCampaignId = new Map<
      string,
      CampaignTargetEligibilityScope
    >();

    if (!productIds || productIds.length === 0) {
      return {
        variantsByProductId,
        mediaByProductId,
        inventoryByVariantId,
        priceItems: [],
        projectStatusById,
        campaignTargetEligibilityByCampaignId,
      };
    }

    const projectIds = Array.from(
      new Set(
        inputProjectIds
          .map((projectId) => this.normalizeOptionalText(projectId))
          .filter((projectId): projectId is string => !!projectId),
      ),
    );
    if (projectIds.length > 0) {
      const { data: projectRows, error: projectsError } = await this.supabase
        .from('v2_projects')
        .select('id,status')
        .in('id', projectIds)
        .is('deleted_at', null);
      if (projectsError) {
        throw new ApiException(
          'v2 shop 프로젝트 조회 실패',
          500,
          'V2_SHOP_PROJECTS_FETCH_FAILED',
        );
      }

      for (const row of projectRows || []) {
        if (row.id && row.status) {
          projectStatusById.set(row.id as string, row.status as V2ProjectStatus);
        }
      }
    }

    const { data: variantRows, error: variantsError } = await this.supabase
      .from('v2_product_variants')
      .select(
        'id,product_id,sku,title,fulfillment_type,requires_shipping,track_inventory,status,created_at',
      )
      .in('product_id', productIds)
      .eq('status', 'ACTIVE')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (variantsError) {
      throw new ApiException(
        'v2 shop variant 조회 실패',
        500,
        'V2_SHOP_VARIANTS_FETCH_FAILED',
      );
    }

    for (const row of variantRows || []) {
      const productId = row.product_id as string;
      const list = variantsByProductId.get(productId) || [];
      list.push(row);
      variantsByProductId.set(productId, list);
    }

    const { data: mediaRows, error: mediaError } = await this.supabase
      .from('v2_product_media')
      .select(
        'id,product_id,media_type,media_role,public_url,alt_text,sort_order,is_primary,status,created_at',
      )
      .in('product_id', productIds)
      .eq('status', 'ACTIVE')
      .is('deleted_at', null)
      .order('is_primary', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (mediaError) {
      throw new ApiException(
        'v2 shop media 조회 실패',
        500,
        'V2_SHOP_MEDIA_FETCH_FAILED',
      );
    }

    for (const row of mediaRows || []) {
      const productId = row.product_id as string;
      const list = mediaByProductId.get(productId) || [];
      list.push(row);
      mediaByProductId.set(productId, list);
    }

    const variantIds = (variantRows || []).map((row: any) => row.id as string);
    if (variantIds.length > 0) {
      const { data: inventoryRows, error: inventoryError } = await this.supabase
        .from('v2_inventory_levels')
        .select('variant_id,available_quantity,safety_stock_quantity')
        .in('variant_id', variantIds);
      if (inventoryError) {
        throw new ApiException(
          'v2 shop inventory 조회 실패',
          500,
          'V2_SHOP_INVENTORY_FETCH_FAILED',
        );
      }

      for (const row of inventoryRows || []) {
        const variantId = row.variant_id as string;
        const availableQuantity = Math.max(0, Number(row.available_quantity ?? 0));
        const safetyStockQuantity = Math.max(
          0,
          Number(row.safety_stock_quantity ?? 0),
        );
        const sellableQuantity = Math.max(
          availableQuantity - safetyStockQuantity,
          0,
        );
        const current = inventoryByVariantId.get(variantId) ?? 0;
        inventoryByVariantId.set(variantId, current + sellableQuantity);
      }
    }

    const { data: priceItems, error: priceItemsError } = await this.supabase
      .from('v2_price_list_items')
      .select(
        `
        id,
        price_list_id,
        product_id,
        variant_id,
        status,
        unit_amount,
        compare_at_amount,
        min_purchase_quantity,
        max_purchase_quantity,
        starts_at,
        ends_at,
        channel_scope_json,
        created_at,
        price_list:v2_price_lists(
          id,
          campaign_id,
          name,
          scope_type,
          status,
          currency_code,
          priority,
          published_at,
          starts_at,
          ends_at,
          channel_scope_json,
          deleted_at,
          campaign:v2_campaigns(
            id,
            campaign_type,
            status,
            starts_at,
            ends_at,
            channel_scope_json,
            deleted_at
          )
        )
      `,
      )
      .in('product_id', productIds)
      .eq('status', 'ACTIVE')
      .is('deleted_at', null);

    if (priceItemsError) {
      throw new ApiException(
        'v2 shop 가격 조회 실패',
        500,
        'V2_SHOP_PRICE_ITEMS_FETCH_FAILED',
      );
    }

    const normalizedPriceItems = (priceItems || []) as any[];
    const loadedCampaignTargetEligibilityByCampaignId =
      await this.loadCampaignTargetEligibilityByCampaignIds(
        normalizedPriceItems.map(
          (item) => item?.price_list?.campaign_id as string | null | undefined,
        ),
      );

    return {
      variantsByProductId,
      mediaByProductId,
      inventoryByVariantId,
      priceItems: normalizedPriceItems,
      projectStatusById,
      campaignTargetEligibilityByCampaignId:
        loadedCampaignTargetEligibilityByCampaignId,
    };
  }

  private resolveShopProjectStatus(
    projectId: string | null | undefined,
    projectStatusById: Map<string, V2ProjectStatus>,
  ): V2ProjectStatus | null {
    const normalizedProjectId = this.normalizeOptionalText(projectId);
    if (!normalizedProjectId) {
      return null;
    }
    return projectStatusById.get(normalizedProjectId) ?? null;
  }

  private pickPrimaryShopMedia(mediaItems: any[]): any | null {
    if (!mediaItems || mediaItems.length === 0) {
      return null;
    }
    const primaryByFlag = mediaItems.find((item) => item.is_primary);
    if (primaryByFlag) {
      return primaryByFlag;
    }
    const primaryByRole = mediaItems.find((item) => item.media_role === 'PRIMARY');
    if (primaryByRole) {
      return primaryByRole;
    }
    return mediaItems[0];
  }

  private buildShopAvailability(params: {
    projectStatus: V2ProjectStatus | null;
    productStatus: V2ProductStatus;
    variant: any | null;
    selectedPriceItem: any | null;
    inventoryQuantity: number | null;
  }): {
    sellable: boolean;
    reason: string | null;
    available_quantity: number | null;
  } {
    const availableQuantity = params.variant?.track_inventory
      ? params.inventoryQuantity
      : null;

    if (params.projectStatus !== 'ACTIVE') {
      return {
        sellable: false,
        reason: 'PROJECT_INACTIVE',
        available_quantity: availableQuantity,
      };
    }
    if (params.productStatus !== 'ACTIVE') {
      return {
        sellable: false,
        reason: 'PRODUCT_INACTIVE',
        available_quantity: availableQuantity,
      };
    }
    if (!params.variant) {
      return {
        sellable: false,
        reason: 'NO_ACTIVE_VARIANT',
        available_quantity: null,
      };
    }
    if (!params.selectedPriceItem) {
      return {
        sellable: false,
        reason: 'PRICE_NOT_AVAILABLE',
        available_quantity: availableQuantity,
      };
    }
    if (
      params.variant.track_inventory &&
      availableQuantity !== null &&
      availableQuantity <= 0
    ) {
      return {
        sellable: false,
        reason: 'OUT_OF_STOCK',
        available_quantity: availableQuantity,
      };
    }

    return {
      sellable: true,
      reason: null,
      available_quantity: availableQuantity,
    };
  }

  private selectShopPriceItem(params: {
    productId: string;
    projectId: string | null;
    variantId: string;
    priceItems: any[];
    evaluatedAt: string;
    campaignId: string | null;
    channel: string | null;
    campaignTargetEligibilityByCampaignId: Map<
      string,
      CampaignTargetEligibilityScope
    >;
  }): { selected: any | null; base: any | null; override: any | null } {
    const candidates = this.filterShopPriceCandidates({
      productId: params.productId,
      projectId: params.projectId,
      variantId: params.variantId,
      priceItems: params.priceItems,
      evaluatedAt: params.evaluatedAt,
      channel: params.channel,
      campaignTargetEligibilityByCampaignId:
        params.campaignTargetEligibilityByCampaignId,
    });

    return this.buildShopPriceSelectionFromCandidates({
      candidates,
      campaignId: params.campaignId,
      evaluatedAt: params.evaluatedAt,
      channel: params.channel,
    });
  }

  private normalizeShopLimit(value?: number): number {
    if (value === undefined || value === null) {
      return 20;
    }
    if (!Number.isInteger(value) || value <= 0 || value > 100) {
      throw new ApiException(
        'limit은 1~100 사이 정수여야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    return value;
  }

  private normalizeShopOffset(value?: string): number {
    if (!value) {
      return 0;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new ApiException(
        'cursor는 0 이상의 정수여야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    return parsed;
  }

  private normalizeShopSort(value?: string): V2ShopSort {
    if (!value) {
      return 'SORT_ORDER';
    }

    const normalized = value.trim().toUpperCase();
    if (
      normalized !== 'SORT_ORDER' &&
      normalized !== 'LATEST' &&
      normalized !== 'OLDEST' &&
      normalized !== 'TITLE_ASC' &&
      normalized !== 'TITLE_DESC'
    ) {
      throw new ApiException(
        'sort는 SORT_ORDER, LATEST, OLDEST, TITLE_ASC, TITLE_DESC 중 하나여야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    return normalized as V2ShopSort;
  }

  private resolvePromotionPhase(
    promotion: any,
  ): 'auto' | 'coupon' | 'shipping' {
    const promotionType = promotion.promotion_type as V2PromotionType;
    if (promotionType.startsWith('SHIPPING_')) {
      return 'shipping';
    }
    if (promotion.coupon_required) {
      return 'coupon';
    }
    return 'auto';
  }

  private evaluatePromotionRules(
    rules: any[],
    context: {
      lines: any[];
      channel: string | null | undefined;
      campaignId: string | null | undefined;
      userId: string | null | undefined;
      subtotal: number;
      currentSubtotal: number;
    },
  ): { passed: boolean; results: Array<{ rule_id: string; passed: boolean; detail: string }> } {
    if (!rules || rules.length === 0) {
      return { passed: true, results: [] };
    }

    const results = rules.map((rule) => {
      const payload = this.normalizeRulePayload(rule.rule_payload);
      const type = rule.rule_type as V2PromotionRuleType;

      if (type === 'MIN_ORDER_AMOUNT') {
        const amount = Number(payload.amount ?? 0);
        const passed = context.currentSubtotal >= amount;
        return {
          rule_id: rule.id as string,
          passed,
          detail: `subtotal=${context.currentSubtotal}, required=${amount}`,
        };
      }
      if (type === 'MIN_ITEM_QUANTITY') {
        const required = Number(payload.quantity ?? payload.min_quantity ?? 0);
        const totalQty = context.lines.reduce(
          (sum, line) => sum + (line.quantity as number),
          0,
        );
        const passed = totalQty >= required;
        return {
          rule_id: rule.id as string,
          passed,
          detail: `quantity=${totalQty}, required=${required}`,
        };
      }
      if (type === 'CHANNEL') {
        const channels = this.normalizeStringArray(payload.channels, true);
        const currentChannel = (context.channel || '').toUpperCase();
        const passed =
          channels.length === 0 ||
          channels.includes('ALL') ||
          channels.includes(currentChannel);
        return {
          rule_id: rule.id as string,
          passed,
          detail: `channel=${context.channel || '-'}, allowed=${channels.join(',')}`,
        };
      }
      if (type === 'USER_SEGMENT') {
        const requiredUserIds = this.normalizeStringArray(payload.user_ids);
        const passed =
          requiredUserIds.length === 0 ||
          (!!context.userId && requiredUserIds.includes(context.userId));
        return {
          rule_id: rule.id as string,
          passed,
          detail: `user_id=${context.userId || '-'}, required_user_count=${requiredUserIds.length}`,
        };
      }

      const allowedValues =
        type === 'TARGET_PROJECT'
          ? this.normalizeStringArray(payload.project_ids)
          : type === 'TARGET_PRODUCT'
            ? this.normalizeStringArray(payload.product_ids)
            : type === 'TARGET_VARIANT'
              ? this.normalizeStringArray(payload.variant_ids)
              : this.normalizeStringArray(payload.product_kinds, true);
      const passed = this.getPromotionEligibleLineIndexes(context.lines, [rule]).length > 0;
      return {
        rule_id: rule.id as string,
        passed,
        detail: `${type} target_count=${allowedValues.length}`,
      };
    });

    return {
      passed: results.every((result) => result.passed),
      results,
    };
  }

  private getPromotionEligibleLineIndexes(lines: any[], rules: any[]): number[] {
    if (!rules || rules.length === 0) {
      return lines.map((_, index) => index);
    }

    let indexes = lines.map((_, index) => index);
    for (const rule of rules) {
      const payload = this.normalizeRulePayload(rule.rule_payload);
      const type = rule.rule_type as V2PromotionRuleType;
      if (type === 'TARGET_PROJECT') {
        const allowed = this.normalizeStringArray(payload.project_ids);
        if (allowed.length > 0) {
          indexes = indexes.filter((index) => allowed.includes(lines[index].project_id));
        }
        continue;
      }
      if (type === 'TARGET_PRODUCT') {
        const allowed = this.normalizeStringArray(payload.product_ids);
        if (allowed.length > 0) {
          indexes = indexes.filter((index) => allowed.includes(lines[index].product_id));
        }
        continue;
      }
      if (type === 'TARGET_VARIANT') {
        const allowed = this.normalizeStringArray(payload.variant_ids);
        if (allowed.length > 0) {
          indexes = indexes.filter((index) => allowed.includes(lines[index].variant_id));
        }
        continue;
      }
      if (type === 'TARGET_BUNDLE') {
        const allowedKinds = this.normalizeStringArray(payload.product_kinds, true);
        if (allowedKinds.length > 0) {
          indexes = indexes.filter((index) =>
            allowedKinds.includes((lines[index].product_kind as string).toUpperCase()),
          );
        } else {
          indexes = indexes.filter((index) => lines[index].product_kind === 'BUNDLE');
        }
      }
    }
    return indexes;
  }

  private calculateItemPromotionDiscounts(
    promotionType: V2PromotionType,
    discountValue: number,
    lines: any[],
    eligibleIndexes: number[],
    remainingByIndex: number[],
  ): number[] {
    if (eligibleIndexes.length === 0) {
      return [];
    }
    if (promotionType === 'ITEM_PERCENT') {
      return eligibleIndexes.map((_, idx) =>
        Math.floor((remainingByIndex[idx] * discountValue) / 100),
      );
    }
    if (promotionType === 'ITEM_FIXED') {
      return eligibleIndexes.map((lineIndex, idx) => {
        const quantity = lines[lineIndex].quantity as number;
        const fixedAmount = Math.round(discountValue * quantity);
        return Math.min(fixedAmount, remainingByIndex[idx]);
      });
    }
    return eligibleIndexes.map(() => 0);
  }

  private capDiscountAllocations(
    discounts: number[],
    maxDiscountAmount: number | null | undefined,
  ): number[] {
    if (discounts.length === 0) {
      return [];
    }
    const total = discounts.reduce((sum, value) => sum + value, 0);
    if (
      maxDiscountAmount === null ||
      maxDiscountAmount === undefined ||
      total <= maxDiscountAmount
    ) {
      return discounts;
    }
    if (maxDiscountAmount <= 0) {
      return discounts.map(() => 0);
    }

    return this.allocateAmountByWeights(maxDiscountAmount, discounts);
  }

  private calculateOrderPromotionDiscount(
    promotionType: V2PromotionType,
    discountValue: number,
    baseAmount: number,
    maxDiscountAmount: number | null | undefined,
  ): number {
    if (baseAmount <= 0) {
      return 0;
    }
    let raw = 0;
    if (promotionType === 'ORDER_PERCENT' || promotionType === 'SHIPPING_PERCENT') {
      raw = Math.floor((baseAmount * discountValue) / 100);
    } else if (
      promotionType === 'ORDER_FIXED' ||
      promotionType === 'SHIPPING_FIXED'
    ) {
      raw = Math.round(discountValue);
    }
    if (maxDiscountAmount !== null && maxDiscountAmount !== undefined) {
      raw = Math.min(raw, maxDiscountAmount);
    }
    return Math.max(Math.min(raw, baseAmount), 0);
  }

  private normalizeRulePayload(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private normalizeStringArray(value: unknown, upperCase = false): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0)
      .map((item) => (upperCase ? item.toUpperCase() : item));
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
      .select('*, media_asset:media_assets(*)')
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
      .select('*, media_asset:media_assets(*)')
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

  private async getMediaAssetById(mediaAssetId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('media_assets')
      .select('*')
      .eq('id', mediaAssetId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'media asset 조회 실패',
        500,
        'MEDIA_ASSET_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'media asset를 찾을 수 없습니다',
        404,
        'MEDIA_ASSET_NOT_FOUND',
      );
    }

    return data;
  }

  private async getMediaAssetReferenceSummaryMap(
    mediaAssetIds: string[],
  ): Promise<
    Map<
      string,
      {
        product_media_count: number;
        digital_asset_count: number;
        campaign_banner_count: number;
        project_cover_count: number;
        total_reference_count: number;
        is_orphan: boolean;
      }
    >
  > {
    const uniqueMediaAssetIds = [...new Set(mediaAssetIds.filter(Boolean))];
    const summaryByAssetId = new Map<
      string,
      {
        product_media_count: number;
        digital_asset_count: number;
        campaign_banner_count: number;
        project_cover_count: number;
        total_reference_count: number;
        is_orphan: boolean;
      }
    >();

    uniqueMediaAssetIds.forEach((mediaAssetId) => {
      summaryByAssetId.set(mediaAssetId, {
        product_media_count: 0,
        digital_asset_count: 0,
        campaign_banner_count: 0,
        project_cover_count: 0,
        total_reference_count: 0,
        is_orphan: true,
      });
    });

    if (uniqueMediaAssetIds.length === 0) {
      return summaryByAssetId;
    }

    const [
      { data: productMediaRows, error: productMediaError },
      { data: digitalAssetRows, error: digitalAssetError },
      { data: campaignRows, error: campaignError },
      { data: projectRows, error: projectError },
    ] = await Promise.all([
      this.supabase
        .from('v2_product_media')
        .select('media_asset_id')
        .in('media_asset_id', uniqueMediaAssetIds)
        .is('deleted_at', null),
      this.supabase
        .from('v2_digital_assets')
        .select('media_asset_id')
        .in('media_asset_id', uniqueMediaAssetIds)
        .is('deleted_at', null),
      this.supabase
        .from('v2_campaigns')
        .select('shop_banner_media_asset_id')
        .in('shop_banner_media_asset_id', uniqueMediaAssetIds)
        .is('deleted_at', null),
      this.supabase
        .from('v2_projects')
        .select('cover_media_asset_id')
        .in('cover_media_asset_id', uniqueMediaAssetIds)
        .is('deleted_at', null),
    ]);

    if (productMediaError || digitalAssetError || campaignError || projectError) {
      throw new ApiException(
        'media asset 참조 현황 조회 실패',
        500,
        'MEDIA_ASSET_REFERENCE_FETCH_FAILED',
      );
    }

    (productMediaRows || []).forEach((row) => {
      const mediaAssetId = row.media_asset_id as string | null;
      if (!mediaAssetId || !summaryByAssetId.has(mediaAssetId)) {
        return;
      }
      const current = summaryByAssetId.get(mediaAssetId)!;
      current.product_media_count += 1;
      current.total_reference_count += 1;
      current.is_orphan = false;
    });

    (digitalAssetRows || []).forEach((row) => {
      const mediaAssetId = row.media_asset_id as string | null;
      if (!mediaAssetId || !summaryByAssetId.has(mediaAssetId)) {
        return;
      }
      const current = summaryByAssetId.get(mediaAssetId)!;
      current.digital_asset_count += 1;
      current.total_reference_count += 1;
      current.is_orphan = false;
    });

    (campaignRows || []).forEach((row) => {
      const mediaAssetId = row.shop_banner_media_asset_id as string | null;
      if (!mediaAssetId || !summaryByAssetId.has(mediaAssetId)) {
        return;
      }
      const current = summaryByAssetId.get(mediaAssetId)!;
      current.campaign_banner_count += 1;
      current.total_reference_count += 1;
      current.is_orphan = false;
    });

    (projectRows || []).forEach((row) => {
      const mediaAssetId = row.cover_media_asset_id as string | null;
      if (!mediaAssetId || !summaryByAssetId.has(mediaAssetId)) {
        return;
      }
      const current = summaryByAssetId.get(mediaAssetId)!;
      current.project_cover_count += 1;
      current.total_reference_count += 1;
      current.is_orphan = false;
    });

    return summaryByAssetId;
  }

  private isIgnorableR2MissingObjectError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const maybeError = error as {
      name?: string;
      Code?: string;
      code?: string;
      $metadata?: { httpStatusCode?: number };
    };

    return (
      maybeError.name === 'NotFound' ||
      maybeError.Code === 'NoSuchKey' ||
      maybeError.code === 'NoSuchKey' ||
      maybeError.$metadata?.httpStatusCode === 404
    );
  }

  private assertNoInlineStorageOverride(
    input: Record<string, unknown>,
  ): void {
    if (
      input.storage_path !== undefined ||
      input.public_url !== undefined
    ) {
      throw new ApiException(
        'storage_path/public_url 직접 입력은 지원하지 않습니다. media_asset_id를 사용하세요.',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private async resolveProductMediaAsset(
    mediaType: V2MediaType,
    input: {
      media_asset_id?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<any> {
    const mediaAssetId = this.normalizeOptionalText(input.media_asset_id);
    if (!mediaAssetId) {
      throw new ApiException(
        'media_asset_id는 필수입니다. 파일을 먼저 업로드한 뒤 선택하세요.',
        400,
        'VALIDATION_ERROR',
      );
    }
    const mediaAsset = await this.getMediaAssetById(mediaAssetId);
    const expectedKind = mediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE';
    if (mediaAsset.asset_kind !== expectedKind) {
      throw new ApiException(
        `선택한 media_asset은 ${expectedKind} 타입이어야 합니다`,
        400,
        'VALIDATION_ERROR',
      );
    }
    return mediaAsset;
  }

  private async resolveCampaignBannerMediaAssetId(
    mediaAssetIdInput: string | null | undefined,
  ): Promise<string | null> {
    const mediaAssetId = this.normalizeOptionalText(mediaAssetIdInput);
    if (!mediaAssetId) {
      return null;
    }
    const mediaAsset = await this.getMediaAssetById(mediaAssetId);
    if (mediaAsset.asset_kind !== 'IMAGE') {
      throw new ApiException(
        'campaign 배너는 IMAGE 타입 media asset만 연결할 수 있습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    return mediaAsset.id as string;
  }

  private async resolveProjectCoverMediaAssetId(
    mediaAssetIdInput: string | null | undefined,
  ): Promise<string | null> {
    const mediaAssetId = this.normalizeOptionalText(mediaAssetIdInput);
    if (!mediaAssetId) {
      return null;
    }
    const mediaAsset = await this.getMediaAssetById(mediaAssetId);
    if (mediaAsset.asset_kind !== 'IMAGE') {
      throw new ApiException(
        'project 커버는 IMAGE 타입 media asset만 연결할 수 있습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    return mediaAsset.id as string;
  }

  private async resolveDigitalAssetMediaAsset(
    input: {
      media_asset_id?: string;
      file_name?: string;
      mime_type?: string;
      file_size?: number;
      checksum?: string | null;
      metadata?: Record<string, unknown>;
    },
    current?: any,
  ): Promise<any> {
    const mediaAssetId = this.normalizeOptionalText(input.media_asset_id);
    if (mediaAssetId) {
      return this.getMediaAssetById(mediaAssetId);
    }

    const hasInlineOverride =
      input.file_name !== undefined ||
      input.mime_type !== undefined ||
      input.file_size !== undefined ||
      input.checksum !== undefined;

    if (!hasInlineOverride && current?.media_asset_id) {
      return this.getMediaAssetById(current.media_asset_id as string);
    }

    if (!current?.media_asset_id) {
      throw new ApiException(
        'media_asset_id는 필수입니다. 파일을 먼저 업로드한 뒤 선택하세요.',
        400,
        'VALIDATION_ERROR',
      );
    }

    return this.getMediaAssetById(current.media_asset_id as string);
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

  private assertMediaAssetKind(value: string): void {
    const allowed: V2MediaAssetKind[] = [
      'IMAGE',
      'VIDEO',
      'AUDIO',
      'DOCUMENT',
      'ARCHIVE',
      'FILE',
    ];
    if (!allowed.includes(value as V2MediaAssetKind)) {
      throw new ApiException(
        'media asset kind 값이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertMediaAssetStatus(value: string): void {
    const allowed: V2MediaAssetStatus[] = ['ACTIVE', 'INACTIVE', 'ARCHIVED'];
    if (!allowed.includes(value as V2MediaAssetStatus)) {
      throw new ApiException(
        'media asset status 값이 유효하지 않습니다',
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

  private inferMediaAssetKind(
    mimeType: string | null | undefined,
    storagePath: string,
  ): V2MediaAssetKind {
    const normalizedMime = (mimeType || '').toLowerCase();
    const lowerPath = storagePath.toLowerCase();
    if (normalizedMime.startsWith('image/')) {
      return 'IMAGE';
    }
    if (normalizedMime.startsWith('video/')) {
      return 'VIDEO';
    }
    if (normalizedMime.startsWith('audio/')) {
      return 'AUDIO';
    }
    if (normalizedMime === 'application/pdf') {
      return 'DOCUMENT';
    }
    if (lowerPath.endsWith('.zip')) {
      return 'ARCHIVE';
    }
    return 'FILE';
  }

  private inferMimeTypeFromPath(storagePath: string): string {
    const lower = storagePath.toLowerCase();
    if (lower.endsWith('.png')) {
      return 'image/png';
    }
    if (lower.endsWith('.webp')) {
      return 'image/webp';
    }
    if (lower.endsWith('.gif')) {
      return 'image/gif';
    }
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      return 'image/jpeg';
    }
    if (lower.endsWith('.svg')) {
      return 'image/svg+xml';
    }
    if (lower.endsWith('.mp4')) {
      return 'video/mp4';
    }
    if (lower.endsWith('.mov')) {
      return 'video/quicktime';
    }
    if (lower.endsWith('.mp3')) {
      return 'audio/mpeg';
    }
    if (lower.endsWith('.wav')) {
      return 'audio/wav';
    }
    if (lower.endsWith('.flac')) {
      return 'audio/flac';
    }
    if (lower.endsWith('.m4a')) {
      return 'audio/mp4';
    }
    if (lower.endsWith('.pdf')) {
      return 'application/pdf';
    }
    if (lower.endsWith('.zip')) {
      return 'application/zip';
    }
    return 'application/octet-stream';
  }

  private getMultipartUploadPartSize(fileSize: number): number {
    const defaultPartSize = 16 * 1024 * 1024;
    const minimumPartSize = 5 * 1024 * 1024;
    const maxPartCount = 10_000;

    let partSize = Math.max(defaultPartSize, minimumPartSize);
    while (Math.ceil(fileSize / partSize) > maxPartCount) {
      partSize += 5 * 1024 * 1024;
    }

    return partSize;
  }

  private formatSupabaseErrorSuffix(
    error:
      | {
          message?: string | null;
          details?: string | null;
          hint?: string | null;
          code?: string | null;
        }
      | null
      | undefined,
  ): string {
    if (!error) {
      return '';
    }

    const detailParts = [
      error.message?.trim(),
      error.details?.trim(),
      error.hint?.trim(),
      error.code?.trim() ? `code=${error.code.trim()}` : null,
    ].filter((value): value is string => !!value);

    if (detailParts.length === 0) {
      return '';
    }

    return ` (${detailParts.join(' | ')})`;
  }

  private getMultipartSessionExpiresAt(): string {
    return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  }

  private async getMediaAssetUploadSessionById(sessionId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('media_asset_upload_sessions')
      .select('*')
      .eq('id', sessionId)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw new ApiException(
        'multipart 업로드 세션을 찾을 수 없습니다',
        404,
        'MEDIA_ASSET_MULTIPART_SESSION_NOT_FOUND',
      );
    }

    return data;
  }

  private async updateMediaAssetUploadSession(
    sessionId: string,
    patch: Record<string, unknown>,
  ): Promise<any> {
    const { data, error } = await this.supabase
      .from('media_asset_upload_sessions')
      .update(patch)
      .eq('id', sessionId)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        `multipart 업로드 세션 갱신 실패${this.formatSupabaseErrorSuffix(error)}`,
        500,
        'MEDIA_ASSET_MULTIPART_SESSION_UPDATE_FAILED',
      );
    }

    return data;
  }

  private assertMultipartSessionAvailable(session: {
    status: V2MediaAssetUploadSessionStatus;
    expires_at?: string | null;
  }): void {
    if (session.status === 'ABORTED') {
      throw new ApiException(
        '중단된 multipart 업로드 세션입니다',
        400,
        'MEDIA_ASSET_MULTIPART_SESSION_ABORTED',
      );
    }

    if (session.status === 'FAILED') {
      throw new ApiException(
        '실패한 multipart 업로드 세션입니다. 새 업로드를 시작해 주세요.',
        400,
        'MEDIA_ASSET_MULTIPART_SESSION_FAILED',
      );
    }

    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
      throw new ApiException(
        '만료된 multipart 업로드 세션입니다. 새 업로드를 시작해 주세요.',
        400,
        'MEDIA_ASSET_MULTIPART_SESSION_EXPIRED',
      );
    }
  }

  private normalizeMultipartPartNumbers(
    partNumbers: number[] | undefined,
    totalParts: number,
  ): number[] {
    if (!Array.isArray(partNumbers) || partNumbers.length === 0) {
      throw new ApiException(
        'part_numbers는 비어 있지 않은 배열이어야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    const normalized = [...new Set(partNumbers)].map((value) => {
      if (!Number.isInteger(value) || value <= 0 || value > totalParts) {
        throw new ApiException(
          `part_number는 1 이상 ${totalParts} 이하의 정수여야 합니다`,
          400,
          'VALIDATION_ERROR',
        );
      }
      return value;
    });

    normalized.sort((left, right) => left - right);
    return normalized;
  }

  private normalizeMultipartCompletedParts(
    parts: Array<{ part_number: number; etag: string }> | undefined,
    totalParts: number,
  ): Array<{ part_number: number; etag: string }> {
    if (!Array.isArray(parts) || parts.length === 0) {
      throw new ApiException(
        'parts는 비어 있지 않은 배열이어야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    const seen = new Set<number>();
    const normalized = parts.map((part) => {
      if (!part || typeof part !== 'object') {
        throw new ApiException(
          '각 part는 object여야 합니다',
          400,
          'VALIDATION_ERROR',
        );
      }

      if (
        !Number.isInteger(part.part_number) ||
        part.part_number <= 0 ||
        part.part_number > totalParts
      ) {
        throw new ApiException(
          `part_number는 1 이상 ${totalParts} 이하의 정수여야 합니다`,
          400,
          'VALIDATION_ERROR',
        );
      }

      if (seen.has(part.part_number)) {
        throw new ApiException(
          '중복된 part_number가 포함되어 있습니다',
          400,
          'VALIDATION_ERROR',
        );
      }
      seen.add(part.part_number);

      const etag = this.normalizeRequiredText(part.etag, 'etag는 필수입니다');
      return {
        part_number: part.part_number,
        etag: etag.startsWith('"') ? etag : `"${etag}"`,
      };
    });

    normalized.sort((left, right) => left.part_number - right.part_number);
    return normalized;
  }

  private validateMediaAssetUploadFile(file: {
    originalname: string;
    mimetype: string;
    size: number;
  }): void {
    if (!file.originalname || !file.mimetype) {
      throw new ApiException(
        '업로드 파일 정보가 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    if (!Number.isInteger(file.size) || file.size <= 0) {
      throw new ApiException(
        '업로드 파일 크기가 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    const maxSizeInMb = 500;
    const maxSize = maxSizeInMb * 1024 * 1024;
    if (file.size > maxSize) {
      throw new ApiException(
        `파일 크기는 ${maxSizeInMb}MB를 초과할 수 없습니다`,
        400,
        'FILE_TOO_LARGE',
      );
    }
  }

  private generateMediaAssetR2Key(
    assetKind: V2MediaAssetKind,
    originalFilename: string,
  ): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const uuid = randomUUID();
    const safeFilename = originalFilename
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const finalName = safeFilename || 'file.bin';
    return `v2/media-assets/${assetKind.toLowerCase()}/${year}/${month}/${uuid}-${finalName}`;
  }

  private normalizeV2R2StoragePath(storagePath: string): string {
    const normalized = storagePath.trim().replace(/^\/+/, '');
    if (!normalized) {
      return 'v2';
    }
    if (normalized.startsWith('v2/')) {
      return normalized;
    }
    return `v2/${normalized}`;
  }

  private extractFileNameFromStoragePath(storagePath: string): string {
    const normalized = storagePath.trim();
    if (!normalized) {
      return 'file';
    }
    const segments = normalized.split('/');
    const candidate = segments[segments.length - 1]?.trim();
    if (!candidate) {
      return normalized;
    }
    return candidate;
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
