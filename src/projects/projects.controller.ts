import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthSessionService } from '../auth/auth-session.service';
import { successResponse } from '../common/api-response';
import { ApiException } from '../common/errors/api.exception';
import { ProjectsService } from './projects.service';

interface ProjectExternalLinksBody {
  youtube?: string;
  spotify?: string;
  other?: string;
}

interface CreateProjectBody {
  name?: string;
  slug?: string;
  cover_image_id?: string | null;
  description?: string | null;
  release_date?: string | null;
  external_links?: ProjectExternalLinksBody | null;
  order_index?: number;
  is_active?: boolean;
}

interface UpdateProjectBody {
  name?: string;
  slug?: string;
  cover_image_id?: string | null;
  description?: string | null;
  release_date?: string | null;
  external_links?: ProjectExternalLinksBody | null;
  order_index?: number;
  is_active?: boolean;
}

interface ReorderProjectsBody {
  orders?: Array<{
    id: string;
    order_index: number;
  }>;
}

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  @Get()
  async getProjects(
    @Headers('authorization') authorization: string | undefined,
    @Query('isActive') isActiveParam?: string,
  ) {
    const { isActive, requiresAdmin } = this.parseIsActiveFilter(isActiveParam);
    if (requiresAdmin) {
      await this.requireAdmin(authorization);
    }

    const projects = await this.projectsService.getProjects({ isActive });
    return successResponse(projects);
  }

  @Post()
  async createProject(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CreateProjectBody,
  ) {
    await this.requireAdmin(authorization);

    if (!body.name || !body.slug) {
      throw new ApiException(
        '프로젝트 이름과 슬러그는 필수입니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    const project = await this.projectsService.createProject({
      name: body.name,
      slug: body.slug,
      cover_image_id: body.cover_image_id,
      description: body.description,
      release_date: body.release_date,
      external_links: body.external_links,
      order_index: body.order_index,
      is_active: body.is_active,
    });

    return successResponse(project);
  }

  @Patch('reorder')
  async reorderProjects(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: ReorderProjectsBody,
  ) {
    await this.requireAdmin(authorization);

    if (!Array.isArray(body.orders)) {
      throw new ApiException(
        'orders 배열이 필요합니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    const result = await this.projectsService.reorderProjects(body.orders);
    return successResponse({
      message: '프로젝트 순서가 변경되었습니다',
      updated_count: result.count,
    });
  }

  @Get('slug/:slug')
  async getProjectBySlug(@Param('slug') slug: string) {
    const project = await this.projectsService.getProjectBySlug(slug);
    return successResponse(project);
  }

  @Get(':id')
  async getProjectById(@Param('id') id: string) {
    const project = await this.projectsService.getProjectById(id);
    return successResponse(project);
  }

  @Patch(':id')
  async updateProject(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
    @Body() body: UpdateProjectBody,
  ) {
    await this.requireAdmin(authorization);
    const project = await this.projectsService.updateProject(id, body);
    return successResponse(project);
  }

  @Delete(':id')
  async deleteProject(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ) {
    await this.requireAdmin(authorization);
    await this.projectsService.deleteProject(id);
    return successResponse({ message: '프로젝트가 삭제되었습니다' });
  }

  private parseIsActiveFilter(raw: string | undefined): {
    isActive?: boolean;
    requiresAdmin: boolean;
  } {
    if (!raw || raw === 'true') {
      return { isActive: true, requiresAdmin: false };
    }
    if (raw === 'false') {
      return { isActive: false, requiresAdmin: true };
    }
    if (raw === 'all') {
      return { isActive: undefined, requiresAdmin: true };
    }

    throw new ApiException(
      'isActive는 true, false, all 중 하나여야 합니다',
      400,
      'VALIDATION_ERROR',
    );
  }

  private async requireAdmin(authorization: string | undefined): Promise<void> {
    const user = await this.authSessionService.requireUser(authorization);
    const isAdmin = await this.authSessionService.isAdmin({
      userId: user.id,
      email: user.email,
    });
    if (!isAdmin) {
      throw new ApiException('관리자 권한이 필요합니다', 403, 'ADMIN_REQUIRED');
    }
  }
}
