import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';

@Injectable()
export class ArtistsService {
  async getArtists(projectId?: string): Promise<any[]> {
    const supabase = getSupabaseClient();

    let query = supabase
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
          alt_text
        )
      `,
      )
      .eq('is_active', true);

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      throw new ApiException('아티스트 목록 조회 실패', 500, 'ARTISTS_FETCH_FAILED');
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
          alt_text
        )
      `,
      )
      .eq('id', id)
      .single();

    if (error && error.code === 'PGRST116') {
      throw new ApiException('아티스트를 찾을 수 없습니다', 404, 'ARTIST_NOT_FOUND');
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
          alt_text
        )
      `,
      )
      .eq('slug', slug)
      .single();

    if (error && error.code === 'PGRST116') {
      throw new ApiException('아티스트를 찾을 수 없습니다', 404, 'ARTIST_NOT_FOUND');
    }
    if (error) {
      throw new ApiException('아티스트 조회 실패', 500, 'ARTIST_FETCH_FAILED');
    }

    return data;
  }
}
