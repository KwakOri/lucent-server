import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthSessionService } from '../auth/auth-session.service';
import { paginatedResponse, successResponse } from '../common/api-response';
import { ApiException } from '../common/errors/api.exception';
import { V2ContentService } from './v2-content.service';

type V2ContentPostType = 'NEWS' | 'NOTICE' | 'BANNER_AD';
type V2ContentPostStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
type V2ContentSort = 'LATEST' | 'OLDEST' | 'SORT_ORDER';

@Controller('v2/content')
export class V2ContentController {
  constructor(
    private readonly v2ContentService: V2ContentService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  @Get('posts')
  async listPublicPosts(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('post_type') postTypeSnake?: V2ContentPostType,
    @Query('postType') postTypeCamel?: V2ContentPostType,
    @Query('featured_on_home') featuredOnHomeSnake?: string,
    @Query('featuredOnHome') featuredOnHomeCamel?: string,
    @Query('sort') sort?: V2ContentSort,
  ) {
    const result = await this.v2ContentService.listPublicPosts({
      page: this.parsePositiveInt(page, 1),
      limit: this.parseOptionalPositiveInt(limit),
      post_type: postTypeSnake ?? postTypeCamel,
      featured_on_home: this.parseOptionalBoolean(
        featuredOnHomeSnake ?? featuredOnHomeCamel,
        'featured_on_home',
      ),
      sort,
    });

    return paginatedResponse(result.posts, {
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  }

  @Get('posts/:slug')
  async getPublicPostBySlug(@Param('slug') slug: string) {
    const post = await this.v2ContentService.getPublicPostBySlug(slug);
    return successResponse(post);
  }

  @Get('admin/posts')
  async listAdminPosts(
    @Headers('authorization') authorization: string | undefined,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('post_type') postTypeSnake?: V2ContentPostType,
    @Query('postType') postTypeCamel?: V2ContentPostType,
    @Query('status') status?: V2ContentPostStatus,
    @Query('search') search?: string,
    @Query('featured_on_home') featuredOnHomeSnake?: string,
    @Query('featuredOnHome') featuredOnHomeCamel?: string,
    @Query('sort') sort?: V2ContentSort,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2ContentService.listAdminPosts({
      page: this.parsePositiveInt(page, 1),
      limit: this.parseOptionalPositiveInt(limit),
      post_type: postTypeSnake ?? postTypeCamel,
      status,
      search,
      featured_on_home: this.parseOptionalBoolean(
        featuredOnHomeSnake ?? featuredOnHomeCamel,
        'featured_on_home',
      ),
      sort,
    });

    return paginatedResponse(result.posts, {
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  }

  @Get('admin/posts/:id')
  async getAdminPost(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') postId: string,
  ) {
    await this.requireAdmin(authorization);
    const post = await this.v2ContentService.getAdminPostById(postId);
    return successResponse(post);
  }

  @Post('admin/posts')
  async createAdminPost(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const admin = await this.requireAdmin(authorization);
    const post = await this.v2ContentService.createAdminPost(
      body,
      this.buildActor(admin),
    );
    return successResponse(post);
  }

  @Patch('admin/posts/:id')
  async updateAdminPost(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') postId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const admin = await this.requireAdmin(authorization);
    const post = await this.v2ContentService.updateAdminPost(
      postId,
      body,
      this.buildActor(admin),
    );
    return successResponse(post);
  }

  @Post('admin/posts/:id/publish')
  async publishAdminPost(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') postId: string,
  ) {
    const admin = await this.requireAdmin(authorization);
    const post = await this.v2ContentService.publishAdminPost(
      postId,
      this.buildActor(admin),
    );
    return successResponse(post, '게시글이 발행되었습니다');
  }

  @Post('admin/posts/:id/archive')
  async archiveAdminPost(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') postId: string,
  ) {
    const admin = await this.requireAdmin(authorization);
    const post = await this.v2ContentService.archiveAdminPost(
      postId,
      this.buildActor(admin),
    );
    return successResponse(post, '게시글이 보관되었습니다');
  }

  private async requireAdmin(authorization: string | undefined): Promise<any> {
    if (this.authSessionService.isLocalAdminBypassEnabled()) {
      const bypassUser =
        await this.authSessionService.getUserFromAuthorizationHeader(
          authorization,
        );
      if (bypassUser?.id) {
        return bypassUser;
      }
      return { id: 'LOCAL_ADMIN_BYPASS', email: 'local-bypass@example.com' };
    }

    const user = await this.authSessionService.requireUser(authorization);
    const isAdmin = await this.authSessionService.isAdmin({
      userId: user.id,
      email: user.email,
    });
    if (!isAdmin) {
      throw new ApiException('관리자 권한이 필요합니다', 403, 'ADMIN_REQUIRED');
    }
    return user;
  }

  private buildActor(admin: any): { id: string | null; email: string | null } {
    return {
      id: typeof admin?.id === 'string' ? admin.id : null,
      email: typeof admin?.email === 'string' ? admin.email : null,
    };
  }

  private parsePositiveInt(
    value: string | undefined,
    fallback: number,
  ): number {
    if (!value) {
      return fallback;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ApiException(
        '숫자 파라미터가 유효하지 않습니다',
        400,
        'VALIDATION_ERROR',
      );
    }
    return parsed;
  }

  private parseOptionalPositiveInt(
    value: string | undefined,
  ): number | undefined {
    if (!value) {
      return undefined;
    }
    return this.parsePositiveInt(value, 1);
  }

  private parseOptionalBoolean(
    value: string | undefined,
    fieldName: string,
  ): boolean | undefined {
    if (value === undefined) {
      return undefined;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
    throw new ApiException(
      `${fieldName}은 boolean 값이어야 합니다`,
      400,
      'VALIDATION_ERROR',
    );
  }
}
