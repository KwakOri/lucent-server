import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';
import { Json, Tables, TablesUpdate } from '../types/database';

type Project = Tables<'projects'>;

interface ProjectExternalLinks {
  youtube?: string;
  spotify?: string;
  other?: string;
}

interface GetProjectsOptions {
  isActive?: boolean;
}

interface CreateProjectInput {
  name: string;
  slug: string;
  cover_image_id?: string | null;
  description?: string | null;
  release_date?: string | null;
  external_links?: ProjectExternalLinks | null;
  order_index?: number;
  is_active?: boolean;
}

interface UpdateProjectInput {
  name?: string;
  slug?: string;
  cover_image_id?: string | null;
  description?: string | null;
  release_date?: string | null;
  external_links?: ProjectExternalLinks | null;
  order_index?: number;
  is_active?: boolean;
}

@Injectable()
export class ProjectsService {
  async getProjects(
    options: GetProjectsOptions = { isActive: true },
  ): Promise<any[]> {
    const supabase = getSupabaseClient();
    let query = supabase.from('projects').select(
      `
        *,
        cover_image:images!projects_cover_image_id_fkey (
          id,
          public_url,
          cdn_url,
          alt_text
        ),
        artists (
          id,
          name,
          slug,
          description
        )
      `,
    );

    if (options.isActive !== undefined) {
      query = query.eq('is_active', options.isActive);
    }

    const { data, error } = await query.order('order_index', {
      ascending: true,
    });

    if (error) {
      throw new ApiException(
        '프로젝트 목록 조회 실패',
        500,
        'PROJECTS_FETCH_FAILED',
      );
    }

    return data || [];
  }

  async getProjectById(id: string): Promise<any> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('projects')
      .select(
        `
        *,
        cover_image:images!projects_cover_image_id_fkey (
          id,
          public_url,
          cdn_url,
          alt_text
        ),
        artists (
          id,
          name,
          slug,
          description,
          profile_image:images!artists_profile_image_id_fkey (
            id,
            public_url,
            alt_text
          )
        )
      `,
      )
      .eq('id', id)
      .single();

    if (error && error.code === 'PGRST116') {
      throw new ApiException(
        '프로젝트를 찾을 수 없습니다',
        404,
        'PROJECT_NOT_FOUND',
      );
    }
    if (error) {
      throw new ApiException('프로젝트 조회 실패', 500, 'PROJECT_FETCH_FAILED');
    }

    return data;
  }

  async getProjectBySlug(slug: string): Promise<any> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('projects')
      .select(
        `
        *,
        cover_image:images!projects_cover_image_id_fkey (
          id,
          public_url,
          cdn_url,
          alt_text
        ),
        artists (
          id,
          name,
          slug,
          description
        )
      `,
      )
      .eq('slug', slug)
      .single();

    if (error && error.code === 'PGRST116') {
      throw new ApiException(
        '프로젝트를 찾을 수 없습니다',
        404,
        'PROJECT_NOT_FOUND',
      );
    }
    if (error) {
      throw new ApiException('프로젝트 조회 실패', 500, 'PROJECT_FETCH_FAILED');
    }

    return data;
  }

  async createProject(projectData: CreateProjectInput): Promise<Project> {
    const supabase = getSupabaseClient();
    const name = this.normalizeRequired(
      projectData.name,
      '프로젝트 이름이 필요합니다',
    );
    const slug = this.normalizeRequired(
      projectData.slug,
      '프로젝트 슬러그가 필요합니다',
    );

    const { data: duplicate, error: duplicateError } = await supabase
      .from('projects')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (duplicateError) {
      throw new ApiException(
        '프로젝트 중복 검사에 실패했습니다',
        500,
        'PROJECT_FETCH_FAILED',
      );
    }
    if (duplicate) {
      throw new ApiException(
        '이미 사용 중인 슬러그입니다',
        409,
        'SLUG_ALREADY_EXISTS',
      );
    }

    const coverImageId = this.normalizeNullable(projectData.cover_image_id);
    if (coverImageId) {
      const { data: image, error: imageError } = await supabase
        .from('images')
        .select('id')
        .eq('id', coverImageId)
        .maybeSingle();

      if (imageError) {
        throw new ApiException(
          '이미지 조회에 실패했습니다',
          500,
          'IMAGE_FETCH_FAILED',
        );
      }
      if (!image) {
        throw new ApiException(
          '이미지를 찾을 수 없습니다',
          404,
          'IMAGE_NOT_FOUND',
        );
      }
    }

    const insertData = {
      name,
      slug,
      cover_image_id: coverImageId,
      description: this.normalizeNullable(projectData.description),
      release_date: this.normalizeNullable(projectData.release_date),
      external_links: this.normalizeExternalLinks(projectData.external_links),
      order_index: projectData.order_index ?? 0,
      is_active: projectData.is_active ?? true,
    };

    const { data, error } = await supabase
      .from('projects')
      .insert(insertData)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        '프로젝트 생성 실패',
        500,
        'PROJECT_CREATE_FAILED',
      );
    }

    return data;
  }

  async updateProject(
    id: string,
    projectData: UpdateProjectInput,
  ): Promise<Project> {
    const supabase = getSupabaseClient();
    const { data: existing, error: existingError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (existingError) {
      throw new ApiException('프로젝트 조회 실패', 500, 'PROJECT_FETCH_FAILED');
    }
    if (!existing) {
      throw new ApiException(
        '프로젝트를 찾을 수 없습니다',
        404,
        'PROJECT_NOT_FOUND',
      );
    }

    let normalizedSlug: string | undefined;
    if (projectData.slug !== undefined) {
      normalizedSlug = this.normalizeRequired(
        projectData.slug,
        '프로젝트 슬러그가 필요합니다',
      );
      const { data: duplicate, error: duplicateError } = await supabase
        .from('projects')
        .select('id')
        .eq('slug', normalizedSlug)
        .neq('id', id)
        .maybeSingle();

      if (duplicateError) {
        throw new ApiException(
          '프로젝트 중복 검사에 실패했습니다',
          500,
          'PROJECT_FETCH_FAILED',
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

    let normalizedCoverImageId: string | null | undefined;
    if (projectData.cover_image_id !== undefined) {
      normalizedCoverImageId = this.normalizeNullable(
        projectData.cover_image_id,
      );
      if (normalizedCoverImageId) {
        const { data: image, error: imageError } = await supabase
          .from('images')
          .select('id')
          .eq('id', normalizedCoverImageId)
          .maybeSingle();

        if (imageError) {
          throw new ApiException(
            '이미지 조회에 실패했습니다',
            500,
            'IMAGE_FETCH_FAILED',
          );
        }
        if (!image) {
          throw new ApiException(
            '이미지를 찾을 수 없습니다',
            404,
            'IMAGE_NOT_FOUND',
          );
        }
      }
    }

    const updateData: TablesUpdate<'projects'> = {};

    if (projectData.name !== undefined) {
      updateData.name = this.normalizeRequired(
        projectData.name,
        '프로젝트 이름이 필요합니다',
      );
    }
    if (normalizedSlug !== undefined) {
      updateData.slug = normalizedSlug;
    }
    if (normalizedCoverImageId !== undefined) {
      updateData.cover_image_id = normalizedCoverImageId;
    }
    if (projectData.description !== undefined) {
      updateData.description = this.normalizeNullable(projectData.description);
    }
    if (projectData.release_date !== undefined) {
      updateData.release_date = this.normalizeNullable(
        projectData.release_date,
      );
    }
    if (projectData.external_links !== undefined) {
      updateData.external_links = this.normalizeExternalLinks(
        projectData.external_links,
      );
    }
    if (projectData.order_index !== undefined) {
      updateData.order_index = projectData.order_index;
    }
    if (projectData.is_active !== undefined) {
      updateData.is_active = projectData.is_active;
    }

    if (Object.keys(updateData).length === 0) {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        throw new ApiException(
          '프로젝트 조회 실패',
          500,
          'PROJECT_FETCH_FAILED',
        );
      }

      return data;
    }

    const { data, error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException(
        '프로젝트 수정 실패',
        500,
        'PROJECT_UPDATE_FAILED',
      );
    }

    return data;
  }

  async deleteProject(id: string): Promise<void> {
    const supabase = getSupabaseClient();
    const { data: existing, error: existingError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (existingError) {
      throw new ApiException('프로젝트 조회 실패', 500, 'PROJECT_FETCH_FAILED');
    }
    if (!existing) {
      throw new ApiException(
        '프로젝트를 찾을 수 없습니다',
        404,
        'PROJECT_NOT_FOUND',
      );
    }

    const { error } = await supabase
      .from('projects')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      throw new ApiException(
        '프로젝트 삭제 실패',
        500,
        'PROJECT_DELETE_FAILED',
      );
    }
  }

  async reorderProjects(
    orders: Array<{ id: string; order_index: number }>,
  ): Promise<{ count: number }> {
    if (orders.length === 0) {
      return { count: 0 };
    }

    const supabase = getSupabaseClient();
    const projectIds = orders.map((order) => order.id);
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id')
      .in('id', projectIds);

    if (projectsError) {
      throw new ApiException('프로젝트 조회 실패', 500, 'PROJECT_FETCH_FAILED');
    }

    const foundIds = new Set((projects || []).map((project) => project.id));
    const missingIds = projectIds.filter((id) => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw new ApiException(
        '일부 프로젝트를 찾을 수 없습니다',
        404,
        'PROJECT_NOT_FOUND',
      );
    }

    let updatedCount = 0;
    for (const order of orders) {
      const { error } = await supabase
        .from('projects')
        .update({ order_index: order.order_index })
        .eq('id', order.id);

      if (error) {
        throw new ApiException(
          '프로젝트 순서 변경 실패',
          500,
          'PROJECT_REORDER_FAILED',
        );
      }
      updatedCount += 1;
    }

    return { count: updatedCount };
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

  private normalizeExternalLinks(
    links: ProjectExternalLinks | null | undefined,
  ): Json | null {
    if (links === undefined || links === null) {
      return null;
    }

    const normalized: Record<string, string> = {};
    const youtube = this.normalizeNullable(links.youtube);
    const spotify = this.normalizeNullable(links.spotify);
    const other = this.normalizeNullable(links.other);

    if (youtube) {
      normalized.youtube = youtube;
    }
    if (spotify) {
      normalized.spotify = spotify;
    }
    if (other) {
      normalized.other = other;
    }

    if (Object.keys(normalized).length === 0) {
      return null;
    }

    return normalized;
  }
}
