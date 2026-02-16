import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';
import { Tables, TablesUpdate } from '../types/database';

type Profile = Tables<'profiles'>;
type ProfileUpdate = TablesUpdate<'profiles'>;

@Injectable()
export class ProfilesService {
  async getProfile(userId: string): Promise<Profile> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw new ApiException('프로필 조회 실패', 500, 'PROFILE_FETCH_FAILED');
    }

    if (!data) {
      throw new ApiException(
        '프로필을 찾을 수 없습니다',
        404,
        'PROFILE_NOT_FOUND',
      );
    }

    return data;
  }

  async updateProfile(
    userId: string,
    requesterId: string,
    profileData: ProfileUpdate,
  ): Promise<Profile> {
    if (userId !== requesterId) {
      throw new ApiException(
        '본인의 프로필만 수정할 수 있습니다',
        403,
        'UNAUTHORIZED',
      );
    }

    const updateData: ProfileUpdate = { ...profileData };
    delete updateData.id;
    delete updateData.email;
    delete updateData.created_at;
    delete updateData.updated_at;

    const normalizedUpdate = Object.fromEntries(
      Object.entries(updateData).filter(([, value]) => value !== undefined),
    ) as ProfileUpdate;

    if (Object.keys(normalizedUpdate).length === 0) {
      return this.getProfile(userId);
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('profiles')
      .update(normalizedUpdate)
      .eq('id', userId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw new ApiException('프로필 수정 실패', 500, 'PROFILE_UPDATE_FAILED');
    }

    if (!data) {
      throw new ApiException(
        '프로필을 찾을 수 없습니다',
        404,
        'PROFILE_NOT_FOUND',
      );
    }

    return data;
  }
}
