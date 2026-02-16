import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';
import { Tables, TablesUpdate } from '../types/database';

type Artist = Tables<'artists'>;

interface GetArtistsOptions {
  projectId?: string;
  isActive?: boolean;
}

interface CreateArtistInput {
  name: string;
  slug: string;
  project_id: string;
  profile_image_id?: string | null;
  description?: string | null;
  is_active?: boolean;
}

interface UpdateArtistInput {
  name?: string;
  slug?: string;
  project_id?: string;
  profile_image_id?: string | null;
  description?: string | null;
  is_active?: boolean;
}

@Injectable()
export class ArtistsService {
  async getArtists(
    options: GetArtistsOptions = { isActive: true },
  ): Promise<any[]> {
    const supabase = getSupabaseClient();

    let query = supabase.from('artists').select(
      `
        *,
        project:projects!artists_project_id_fkey (
          id,
          name,
          slug
        ),
        profile_image:images!artists_profile_image_id_fkey (
          id,
          public_url,
          cdn_url,
          alt_text
        )
      `,
    );

    if (options.projectId) {
      query = query.eq('project_id', options.projectId);
    }
    if (options.isActive !== undefined) {
      query = query.eq('is_active', options.isActive);
    }

    const { data, error } = await query.order('created_at', {
      ascending: false,
    });
    if (error) {
      throw new ApiException(
        '아티스트 목록 조회 실패',
        500,
        'ARTISTS_FETCH_FAILED',
      );
    }

    return data || [];
  }

  async getArtistById(id: string): Promise<any> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('artists')
      .select(
        `
        *,
        project:projects!artists_project_id_fkey (
          id,
          name,
          slug,
          description
        ),
        profile_image:images!artists_profile_image_id_fkey (
          id,
          public_url,
          cdn_url,
          alt_text
        )
      `,
      )
      .eq('id', id)
      .single();

    if (error && error.code === 'PGRST116') {
      throw new ApiException(
        '아티스트를 찾을 수 없습니다',
        404,
        'ARTIST_NOT_FOUND',
      );
    }
    if (error) {
      throw new ApiException('아티스트 조회 실패', 500, 'ARTIST_FETCH_FAILED');
    }

    return data;
  }

  async getArtistBySlug(slug: string): Promise<any> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('artists')
      .select(
        `
        *,
        project:projects!artists_project_id_fkey (
          id,
          name,
          slug
        ),
        profile_image:images!artists_profile_image_id_fkey (
          id,
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
        '아티스트를 찾을 수 없습니다',
        404,
        'ARTIST_NOT_FOUND',
      );
    }
    if (error) {
      throw new ApiException('아티스트 조회 실패', 500, 'ARTIST_FETCH_FAILED');
    }

    return data;
  }

  async createArtist(artistData: CreateArtistInput): Promise<Artist> {
    const supabase = getSupabaseClient();
    const name = this.normalizeRequired(
      artistData.name,
      '아티스트 이름이 필요합니다',
    );
    const slug = this.normalizeRequired(
      artistData.slug,
      '아티스트 슬러그가 필요합니다',
    );
    const projectId = this.normalizeRequired(
      artistData.project_id,
      '프로젝트 ID가 필요합니다',
    );

    const { data: duplicate, error: duplicateError } = await supabase
      .from('artists')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (duplicateError) {
      throw new ApiException(
        '아티스트 중복 검사에 실패했습니다',
        500,
        'ARTIST_FETCH_FAILED',
      );
    }
    if (duplicate) {
      throw new ApiException(
        '이미 사용 중인 슬러그입니다',
        409,
        'SLUG_ALREADY_EXISTS',
      );
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError) {
      throw new ApiException(
        '프로젝트 조회에 실패했습니다',
        500,
        'PROJECT_FETCH_FAILED',
      );
    }
    if (!project) {
      throw new ApiException(
        '프로젝트를 찾을 수 없습니다',
        404,
        'PROJECT_NOT_FOUND',
      );
    }

    const profileImageId = this.normalizeNullable(artistData.profile_image_id);
    if (profileImageId) {
      const { data: image, error: imageError } = await supabase
        .from('images')
        .select('id')
        .eq('id', profileImageId)
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

    const { data, error } = await supabase
      .from('artists')
      .insert({
        name,
        slug,
        project_id: projectId,
        profile_image_id: profileImageId,
        description: this.normalizeNullable(artistData.description),
        is_active: artistData.is_active ?? true,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException('아티스트 생성 실패', 500, 'ARTIST_CREATE_FAILED');
    }

    return data;
  }

  async updateArtist(
    id: string,
    artistData: UpdateArtistInput,
  ): Promise<Artist> {
    const supabase = getSupabaseClient();
    const { data: existing, error: existingError } = await supabase
      .from('artists')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (existingError) {
      throw new ApiException('아티스트 조회 실패', 500, 'ARTIST_FETCH_FAILED');
    }
    if (!existing) {
      throw new ApiException(
        '아티스트를 찾을 수 없습니다',
        404,
        'ARTIST_NOT_FOUND',
      );
    }

    let normalizedSlug: string | undefined;
    if (artistData.slug !== undefined) {
      normalizedSlug = this.normalizeRequired(
        artistData.slug,
        '아티스트 슬러그가 필요합니다',
      );
      const { data: duplicate, error: duplicateError } = await supabase
        .from('artists')
        .select('id')
        .eq('slug', normalizedSlug)
        .neq('id', id)
        .maybeSingle();

      if (duplicateError) {
        throw new ApiException(
          '아티스트 중복 검사에 실패했습니다',
          500,
          'ARTIST_FETCH_FAILED',
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
    if (artistData.project_id !== undefined) {
      normalizedProjectId = this.normalizeRequired(
        artistData.project_id,
        '프로젝트 ID가 필요합니다',
      );
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('id', normalizedProjectId)
        .maybeSingle();

      if (projectError) {
        throw new ApiException(
          '프로젝트 조회에 실패했습니다',
          500,
          'PROJECT_FETCH_FAILED',
        );
      }
      if (!project) {
        throw new ApiException(
          '프로젝트를 찾을 수 없습니다',
          404,
          'PROJECT_NOT_FOUND',
        );
      }
    }

    let normalizedProfileImageId: string | null | undefined;
    if (artistData.profile_image_id !== undefined) {
      normalizedProfileImageId = this.normalizeNullable(
        artistData.profile_image_id,
      );
      if (normalizedProfileImageId) {
        const { data: image, error: imageError } = await supabase
          .from('images')
          .select('id')
          .eq('id', normalizedProfileImageId)
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

    const updateData: TablesUpdate<'artists'> = {};

    if (artistData.name !== undefined) {
      updateData.name = this.normalizeRequired(
        artistData.name,
        '아티스트 이름이 필요합니다',
      );
    }
    if (normalizedSlug !== undefined) {
      updateData.slug = normalizedSlug;
    }
    if (normalizedProjectId !== undefined) {
      updateData.project_id = normalizedProjectId;
    }
    if (normalizedProfileImageId !== undefined) {
      updateData.profile_image_id = normalizedProfileImageId;
    }
    if (artistData.description !== undefined) {
      updateData.description = this.normalizeNullable(artistData.description);
    }
    if (artistData.is_active !== undefined) {
      updateData.is_active = artistData.is_active;
    }

    if (Object.keys(updateData).length === 0) {
      const { data, error } = await supabase
        .from('artists')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        throw new ApiException(
          '아티스트 조회 실패',
          500,
          'ARTIST_FETCH_FAILED',
        );
      }

      return data;
    }

    const { data, error } = await supabase
      .from('artists')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      throw new ApiException('아티스트 수정 실패', 500, 'ARTIST_UPDATE_FAILED');
    }

    return data;
  }

  async deleteArtist(id: string): Promise<void> {
    const supabase = getSupabaseClient();
    const { data: existing, error: existingError } = await supabase
      .from('artists')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (existingError) {
      throw new ApiException('아티스트 조회 실패', 500, 'ARTIST_FETCH_FAILED');
    }
    if (!existing) {
      throw new ApiException(
        '아티스트를 찾을 수 없습니다',
        404,
        'ARTIST_NOT_FOUND',
      );
    }

    const { error } = await supabase
      .from('artists')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      throw new ApiException('아티스트 삭제 실패', 500, 'ARTIST_DELETE_FAILED');
    }
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
}
