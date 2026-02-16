import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';

@Injectable()
export class ProjectsService {
  async getProjects(): Promise<any[]> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('projects')
      .select(
        `
        *,
        cover_image:images!projects_cover_image_id_fkey (
          id,
          public_url,
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
      .eq('is_active', true)
      .order('order_index', { ascending: true });

    if (error) {
      throw new ApiException('프로젝트 목록 조회 실패', 500, 'PROJECTS_FETCH_FAILED');
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
      throw new ApiException('프로젝트를 찾을 수 없습니다', 404, 'PROJECT_NOT_FOUND');
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
      throw new ApiException('프로젝트를 찾을 수 없습니다', 404, 'PROJECT_NOT_FOUND');
    }
    if (error) {
      throw new ApiException('프로젝트 조회 실패', 500, 'PROJECT_FETCH_FAILED');
    }

    return data;
  }
}
