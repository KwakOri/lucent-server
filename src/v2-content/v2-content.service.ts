import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';

type V2ContentPostType = 'NEWS' | 'NOTICE' | 'BANNER_AD';
type V2ContentPostStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
type V2ContentSort = 'LATEST' | 'OLDEST' | 'SORT_ORDER';

interface ListPublicPostsInput {
  page?: number;
  limit?: number;
  post_type?: V2ContentPostType;
  featured_on_home?: boolean;
  sort?: V2ContentSort;
}

interface ListAdminPostsInput {
  page?: number;
  limit?: number;
  post_type?: V2ContentPostType;
  status?: V2ContentPostStatus;
  search?: string;
  featured_on_home?: boolean;
  sort?: V2ContentSort;
}

interface UpsertPostInput {
  slug?: string;
  title?: string;
  summary?: string | null;
  body_json?: unknown;
  body_text?: string | null;
  post_type?: V2ContentPostType;
  status?: V2ContentPostStatus;
  cover_media_asset_id?: string | null;
  cover_alt_text?: string | null;
  cta_label?: string | null;
  cta_url?: string | null;
  featured_on_home?: boolean;
  sort_order?: number;
  starts_at?: string | null;
  ends_at?: string | null;
  published_at?: string | null;
  metadata?: Record<string, unknown>;
}

interface PostListResult {
  posts: any[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class V2ContentService {
  private readonly supabase = getSupabaseClient() as any;

  async listPublicPosts(
    input: ListPublicPostsInput = {},
  ): Promise<PostListResult> {
    const page = this.normalizePage(input.page);
    const limit = this.normalizeLimit(input.limit, 12, 50);
    const nowIso = new Date().toISOString();

    let query = this.supabase
      .from('v2_content_posts')
      .select(this.publicListSelect(), { count: 'exact' })
      .is('deleted_at', null)
      .eq('status', 'PUBLISHED')
      .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
      .or(`ends_at.is.null,ends_at.gte.${nowIso}`);

    if (input.post_type) {
      this.assertPostType(input.post_type);
      query = query.eq('post_type', input.post_type);
    }
    if (input.featured_on_home !== undefined) {
      query = query.eq('featured_on_home', input.featured_on_home);
    }

    query = this.applySort(
      query,
      input.sort || (input.featured_on_home ? 'SORT_ORDER' : 'LATEST'),
    );
    query = this.applyRange(query, page, limit);

    const { data, error, count } = await query;
    if (error) {
      throw new ApiException(
        `게시글 목록 조회 실패: ${error.message}`,
        500,
        'V2_CONTENT_POSTS_FETCH_FAILED',
      );
    }

    return {
      posts: data || [],
      total: count || 0,
      page,
      limit,
    };
  }

  async getPublicPostBySlug(slug: string): Promise<any> {
    const normalizedSlug = this.normalizeRequiredSlug(slug);
    const nowIso = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('v2_content_posts')
      .select(this.publicDetailSelect())
      .eq('slug', normalizedSlug)
      .is('deleted_at', null)
      .eq('status', 'PUBLISHED')
      .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
      .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        `게시글 조회 실패: ${error.message}`,
        500,
        'V2_CONTENT_POST_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        '게시글을 찾을 수 없습니다',
        404,
        'V2_CONTENT_POST_NOT_FOUND',
      );
    }

    return data;
  }

  async listAdminPosts(
    input: ListAdminPostsInput = {},
  ): Promise<PostListResult> {
    const page = this.normalizePage(input.page);
    const limit = this.normalizeLimit(input.limit, 20, 100);

    let query = this.supabase
      .from('v2_content_posts')
      .select(this.adminListSelect(), { count: 'exact' })
      .is('deleted_at', null);

    if (input.post_type) {
      this.assertPostType(input.post_type);
      query = query.eq('post_type', input.post_type);
    }
    if (input.status) {
      this.assertPostStatus(input.status);
      query = query.eq('status', input.status);
    }
    if (input.featured_on_home !== undefined) {
      query = query.eq('featured_on_home', input.featured_on_home);
    }
    if (input.search?.trim()) {
      const search = this.escapePostgrestSearch(input.search.trim());
      query = query.or(
        `title.ilike.%${search}%,summary.ilike.%${search}%,body_text.ilike.%${search}%,slug.ilike.%${search}%`,
      );
    }

    query = this.applySort(query, input.sort || 'LATEST');
    query = this.applyRange(query, page, limit);

    const { data, error, count } = await query;
    if (error) {
      throw new ApiException(
        `관리자 게시글 목록 조회 실패: ${error.message}`,
        500,
        'V2_CONTENT_ADMIN_POSTS_FETCH_FAILED',
      );
    }

    return {
      posts: data || [],
      total: count || 0,
      page,
      limit,
    };
  }

  async getAdminPostById(postId: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('v2_content_posts')
      .select(this.adminDetailSelect())
      .eq('id', this.normalizeRequiredText(postId, 'postId는 필수입니다'))
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        `관리자 게시글 조회 실패: ${error.message}`,
        500,
        'V2_CONTENT_ADMIN_POST_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        '게시글을 찾을 수 없습니다',
        404,
        'V2_CONTENT_POST_NOT_FOUND',
      );
    }

    return data;
  }

  async createAdminPost(
    input: UpsertPostInput,
    actor: { id?: string | null },
  ): Promise<any> {
    const normalized = await this.normalizePostInput(input, { mode: 'create' });
    const nowIso = new Date().toISOString();
    const status = normalized.status || 'DRAFT';

    const insertData = {
      ...normalized,
      status,
      published_at:
        status === 'PUBLISHED'
          ? normalized.published_at || nowIso
          : normalized.published_at || null,
      created_by: this.normalizeActorId(actor),
      updated_by: this.normalizeActorId(actor),
    };

    const { data, error } = await this.supabase
      .from('v2_content_posts')
      .insert(insertData)
      .select(this.adminDetailSelect())
      .single();

    if (error?.code === '23505') {
      throw new ApiException(
        '이미 사용 중인 slug입니다',
        409,
        'V2_CONTENT_POST_SLUG_CONFLICT',
      );
    }
    if (error) {
      throw new ApiException(
        `게시글 생성 실패: ${error.message}`,
        500,
        'V2_CONTENT_POST_CREATE_FAILED',
      );
    }

    return data;
  }

  async updateAdminPost(
    postId: string,
    input: UpsertPostInput,
    actor: { id?: string | null },
  ): Promise<any> {
    const current = await this.getAdminPostById(postId);
    const normalized = await this.normalizePostInput(input, {
      mode: 'update',
      current,
    });

    if (Object.keys(normalized).length === 0) {
      return this.getAdminPostById(postId);
    }

    const { data, error } = await this.supabase
      .from('v2_content_posts')
      .update({
        ...normalized,
        updated_by: this.normalizeActorId(actor),
      })
      .eq('id', postId)
      .is('deleted_at', null)
      .select(this.adminDetailSelect())
      .single();

    if (error?.code === '23505') {
      throw new ApiException(
        '이미 사용 중인 slug입니다',
        409,
        'V2_CONTENT_POST_SLUG_CONFLICT',
      );
    }
    if (error) {
      throw new ApiException(
        `게시글 수정 실패: ${error.message}`,
        500,
        'V2_CONTENT_POST_UPDATE_FAILED',
      );
    }

    return data;
  }

  async publishAdminPost(
    postId: string,
    actor: { id?: string | null },
  ): Promise<any> {
    const current = await this.getAdminPostById(postId);
    this.assertPublishablePost(current);

    const { data, error } = await this.supabase
      .from('v2_content_posts')
      .update({
        status: 'PUBLISHED',
        published_at: current.published_at || new Date().toISOString(),
        updated_by: this.normalizeActorId(actor),
      })
      .eq('id', postId)
      .is('deleted_at', null)
      .select(this.adminDetailSelect())
      .single();

    if (error) {
      throw new ApiException(
        `게시글 발행 실패: ${error.message}`,
        500,
        'V2_CONTENT_POST_PUBLISH_FAILED',
      );
    }

    return data;
  }

  async archiveAdminPost(
    postId: string,
    actor: { id?: string | null },
  ): Promise<any> {
    await this.getAdminPostById(postId);

    const { data, error } = await this.supabase
      .from('v2_content_posts')
      .update({
        status: 'ARCHIVED',
        updated_by: this.normalizeActorId(actor),
      })
      .eq('id', postId)
      .is('deleted_at', null)
      .select(this.adminDetailSelect())
      .single();

    if (error) {
      throw new ApiException(
        `게시글 보관 실패: ${error.message}`,
        500,
        'V2_CONTENT_POST_ARCHIVE_FAILED',
      );
    }

    return data;
  }

  private publicListSelect(): string {
    return `
      id,
      slug,
      title,
      summary,
      body_text,
      post_type,
      status,
      cover_alt_text,
      cta_label,
      cta_url,
      featured_on_home,
      sort_order,
      starts_at,
      ends_at,
      published_at,
      created_at,
      updated_at,
      cover_media_asset:media_assets!v2_content_posts_cover_media_asset_id_fkey (
        id,
        public_url,
        file_name,
        mime_type,
        status
      )
    `;
  }

  private publicDetailSelect(): string {
    return `
      id,
      slug,
      title,
      summary,
      body_json,
      body_text,
      post_type,
      status,
      cover_alt_text,
      cta_label,
      cta_url,
      featured_on_home,
      sort_order,
      starts_at,
      ends_at,
      published_at,
      created_at,
      updated_at,
      cover_media_asset:media_assets!v2_content_posts_cover_media_asset_id_fkey (
        id,
        public_url,
        file_name,
        mime_type,
        status
      )
    `;
  }

  private adminListSelect(): string {
    return `
      id,
      slug,
      title,
      summary,
      body_text,
      post_type,
      status,
      cover_media_asset_id,
      cover_alt_text,
      cta_label,
      cta_url,
      featured_on_home,
      sort_order,
      starts_at,
      ends_at,
      published_at,
      created_by,
      updated_by,
      metadata,
      created_at,
      updated_at,
      cover_media_asset:media_assets!v2_content_posts_cover_media_asset_id_fkey (
        id,
        public_url,
        file_name,
        mime_type,
        status
      )
    `;
  }

  private adminDetailSelect(): string {
    return `
      id,
      slug,
      title,
      summary,
      body_json,
      body_text,
      post_type,
      status,
      cover_media_asset_id,
      cover_alt_text,
      cta_label,
      cta_url,
      featured_on_home,
      sort_order,
      starts_at,
      ends_at,
      published_at,
      created_by,
      updated_by,
      metadata,
      created_at,
      updated_at,
      cover_media_asset:media_assets!v2_content_posts_cover_media_asset_id_fkey (
        id,
        public_url,
        file_name,
        mime_type,
        status
      )
    `;
  }

  private applySort(query: any, sort: V2ContentSort): any {
    if (sort === 'OLDEST') {
      return query.order('published_at', {
        ascending: true,
        nullsFirst: false,
      });
    }
    if (sort === 'SORT_ORDER') {
      return query
        .order('sort_order', { ascending: true })
        .order('published_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
    }
    return query
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
  }

  private applyRange(query: any, page: number, limit: number): any {
    const from = (page - 1) * limit;
    return query.range(from, from + limit - 1);
  }

  private async normalizePostInput(
    input: UpsertPostInput,
    options: { mode: 'create' | 'update'; current?: any },
  ): Promise<Record<string, unknown>> {
    const output: Record<string, unknown> = {};

    if (options.mode === 'create' || input.title !== undefined) {
      output.title = this.normalizeRequiredText(
        input.title,
        '제목은 필수입니다',
      );
    }

    if (options.mode === 'create' || input.slug !== undefined) {
      const source = input.slug || input.title;
      output.slug = this.normalizeRequiredSlug(source);
    }

    if (input.summary !== undefined) {
      output.summary = this.normalizeNullableText(input.summary);
    } else if (options.mode === 'create') {
      output.summary = null;
    }

    if (options.mode === 'create' || input.body_json !== undefined) {
      const bodyJson = this.normalizeTiptapDocument(input.body_json);
      output.body_json = bodyJson;
      output.body_text = this.normalizeBodyText(
        input.body_text,
        this.extractTextFromTiptapDocument(bodyJson),
      );
    } else if (input.body_text !== undefined) {
      output.body_text = this.normalizeBodyText(input.body_text, '');
    }

    if (input.post_type !== undefined) {
      this.assertPostType(input.post_type);
      output.post_type = input.post_type;
    } else if (options.mode === 'create') {
      output.post_type = 'NEWS';
    }

    if (input.status !== undefined) {
      this.assertPostStatus(input.status);
      output.status = input.status;
      if (input.status === 'PUBLISHED' && input.published_at === undefined) {
        output.published_at = new Date().toISOString();
      }
    }

    if (input.cover_media_asset_id !== undefined) {
      output.cover_media_asset_id = await this.resolveCoverMediaAssetId(
        input.cover_media_asset_id,
      );
    }

    if (input.cover_alt_text !== undefined) {
      output.cover_alt_text = this.normalizeNullableText(input.cover_alt_text);
    }
    if (input.cta_label !== undefined) {
      output.cta_label = this.normalizeNullableText(input.cta_label);
    }
    if (input.cta_url !== undefined) {
      output.cta_url = this.normalizeOptionalUrl(input.cta_url);
    }
    if (input.featured_on_home !== undefined) {
      output.featured_on_home = Boolean(input.featured_on_home);
    } else if (options.mode === 'create') {
      output.featured_on_home = false;
    }
    if (input.sort_order !== undefined) {
      output.sort_order = this.normalizeNonNegativeInteger(
        input.sort_order,
        'sort_order',
      );
    } else if (options.mode === 'create') {
      output.sort_order = 0;
    }
    if (input.starts_at !== undefined) {
      output.starts_at = this.normalizeOptionalIsoTimestamp(
        input.starts_at,
        'starts_at',
      );
    }
    if (input.ends_at !== undefined) {
      output.ends_at = this.normalizeOptionalIsoTimestamp(
        input.ends_at,
        'ends_at',
      );
    }
    if (input.published_at !== undefined) {
      output.published_at = this.normalizeOptionalIsoTimestamp(
        input.published_at,
        'published_at',
      );
    }
    if (input.metadata !== undefined) {
      output.metadata = this.normalizeMetadata(input.metadata);
    } else if (options.mode === 'create') {
      output.metadata = {};
    }

    const hasStartsAt = Object.prototype.hasOwnProperty.call(
      output,
      'starts_at',
    );
    const hasEndsAt = Object.prototype.hasOwnProperty.call(output, 'ends_at');
    const startsAt = (
      hasStartsAt ? output.starts_at : options.current?.starts_at
    ) as string | null | undefined;
    const endsAt = (hasEndsAt ? output.ends_at : options.current?.ends_at) as
      | string
      | null
      | undefined;
    if (startsAt && endsAt && Date.parse(startsAt) > Date.parse(endsAt)) {
      throw new ApiException(
        '종료 시점은 시작 시점보다 늦어야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    return output;
  }

  private normalizeTiptapDocument(value: unknown): Record<string, unknown> {
    if (value === undefined || value === null || value === '') {
      return { type: 'doc', content: [] };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ApiException(
        'body_json은 Tiptap JSON object여야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    const document = value as Record<string, unknown>;
    if (document.type !== 'doc') {
      throw new ApiException(
        'body_json.type은 doc이어야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    if (document.content !== undefined && !Array.isArray(document.content)) {
      throw new ApiException(
        'body_json.content는 배열이어야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    return document;
  }

  private extractTextFromTiptapDocument(
    document: Record<string, unknown>,
  ): string {
    const parts: string[] = [];
    const visit = (node: unknown) => {
      if (!node || typeof node !== 'object') {
        return;
      }
      const record = node as Record<string, unknown>;
      if (typeof record.text === 'string') {
        parts.push(record.text);
      }
      if (Array.isArray(record.content)) {
        record.content.forEach(visit);
      }
    };
    visit(document);
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  private normalizeBodyText(
    value: string | null | undefined,
    fallback: string,
  ): string {
    const normalized =
      typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : fallback;
    return normalized.slice(0, 20000);
  }

  private async resolveCoverMediaAssetId(
    value: string | null | undefined,
  ): Promise<string | null> {
    const mediaAssetId = this.normalizeNullableText(value);
    if (!mediaAssetId) {
      return null;
    }

    const { data, error } = await this.supabase
      .from('media_assets')
      .select('id, asset_kind, status, deleted_at')
      .eq('id', mediaAssetId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'cover media asset 조회 실패',
        500,
        'V2_CONTENT_COVER_ASSET_FETCH_FAILED',
      );
    }
    if (!data) {
      throw new ApiException(
        'cover media asset을 찾을 수 없습니다',
        404,
        'V2_CONTENT_COVER_ASSET_NOT_FOUND',
      );
    }
    if (data.asset_kind !== 'IMAGE') {
      throw new ApiException(
        'cover media asset은 IMAGE 타입이어야 합니다',
        400,
        'V2_CONTENT_COVER_ASSET_KIND_INVALID',
      );
    }
    if (data.status !== 'ACTIVE') {
      throw new ApiException(
        'ACTIVE 상태의 cover media asset만 연결할 수 있습니다',
        400,
        'V2_CONTENT_COVER_ASSET_STATUS_INVALID',
      );
    }

    return data.id;
  }

  private assertPublishablePost(post: any): void {
    if (!post?.title?.trim()) {
      throw new ApiException(
        '제목이 없는 게시글은 발행할 수 없습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    if (!post?.slug?.trim()) {
      throw new ApiException(
        'slug가 없는 게시글은 발행할 수 없습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    if (!post?.body_text?.trim()) {
      throw new ApiException(
        '본문이 없는 게시글은 발행할 수 없습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private normalizeRequiredText(value: unknown, message: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new ApiException(message, 400, 'VALIDATION_ERROR');
    }
    return value.trim();
  }

  private normalizeNullableText(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized || null;
  }

  private normalizeRequiredSlug(value: unknown): string {
    const raw = this.normalizeRequiredText(value, 'slug는 필수입니다');
    const slug = raw
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 160);

    if (!slug) {
      throw new ApiException(
        'slug는 문자나 숫자를 포함해야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    return slug;
  }

  private normalizeOptionalUrl(value: unknown): string | null {
    const normalized = this.normalizeNullableText(value);
    if (!normalized) {
      return null;
    }
    if (normalized.startsWith('/')) {
      return normalized;
    }
    if (/^https?:\/\//i.test(normalized)) {
      return normalized;
    }
    throw new ApiException(
      'cta_url은 /로 시작하는 내부 경로 또는 http(s) URL이어야 합니다',
      400,
      'VALIDATION_ERROR',
    );
  }

  private normalizeOptionalIsoTimestamp(
    value: unknown,
    fieldName: string,
  ): string | null {
    const normalized = this.normalizeNullableText(value);
    if (!normalized) {
      return null;
    }
    const timestamp = Date.parse(normalized);
    if (!Number.isFinite(timestamp)) {
      throw new ApiException(
        `${fieldName}은 ISO timestamp여야 합니다`,
        400,
        'VALIDATION_ERROR',
      );
    }
    return new Date(timestamp).toISOString();
  }

  private normalizeNonNegativeInteger(
    value: unknown,
    fieldName: string,
  ): number {
    const parsed =
      typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new ApiException(
        `${fieldName}은 0 이상의 정수여야 합니다`,
        400,
        'VALIDATION_ERROR',
      );
    }
    return parsed;
  }

  private normalizeMetadata(value: unknown): Record<string, unknown> {
    if (value === null || value === undefined) {
      return {};
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    throw new ApiException(
      'metadata는 object여야 합니다',
      400,
      'VALIDATION_ERROR',
    );
  }

  private normalizePage(value: unknown): number {
    if (value === undefined || value === null || value === '') {
      return 1;
    }
    const parsed =
      typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ApiException(
        'page는 양의 정수여야 합니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    return parsed;
  }

  private normalizeLimit(
    value: unknown,
    fallback: number,
    max: number,
  ): number {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }
    const parsed =
      typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > max) {
      throw new ApiException(
        `limit은 1 이상 ${max} 이하의 정수여야 합니다`,
        400,
        'VALIDATION_ERROR',
      );
    }
    return parsed;
  }

  private normalizeActorId(actor: { id?: string | null }): string | null {
    return typeof actor?.id === 'string' && actor.id !== 'LOCAL_ADMIN_BYPASS'
      ? actor.id
      : null;
  }

  private assertPostType(value: string): void {
    const allowed: V2ContentPostType[] = ['NEWS', 'NOTICE', 'BANNER_AD'];
    if (!allowed.includes(value as V2ContentPostType)) {
      throw new ApiException(
        'post_type이 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private assertPostStatus(value: string): void {
    const allowed: V2ContentPostStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
    if (!allowed.includes(value as V2ContentPostStatus)) {
      throw new ApiException(
        'status가 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private escapePostgrestSearch(value: string): string {
    return value.replace(/[%,]/g, '');
  }
}
