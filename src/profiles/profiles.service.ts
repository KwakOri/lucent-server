import { Injectable, Logger } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { AppConfigService } from '../config/app-config.service';
import { SendonService } from '../sendon/sendon.service';
import { getSupabaseClient } from '../supabase/supabase.client';
import { Tables, TablesUpdate } from '../types/database';

type Profile = Tables<'profiles'>;
type ProfileUpdate = TablesUpdate<'profiles'>;

type PublicProfile = Pick<
  Profile,
  | 'id'
  | 'email'
  | 'name'
  | 'phone'
  | 'main_address'
  | 'detail_address'
  | 'is_phone_verified'
  | 'created_at'
  | 'updated_at'
>;

type PhoneVerificationProfile = Pick<
  Profile,
  | 'id'
  | 'phone'
  | 'is_phone_verified'
  | 'phone_verification_code'
  | 'phone_verification_expires_at'
  | 'phone_verification_request_count'
  | 'phone_verification_request_date'
>;

const PROFILE_PUBLIC_COLUMNS =
  'id,email,name,phone,main_address,detail_address,is_phone_verified,created_at,updated_at';

const PHONE_VERIFICATION_CODE_TTL_SECONDS = 300;
const PHONE_VERIFICATION_DAILY_LIMIT = 5;
const PHONE_VERIFICATION_VARIABLE_KEY = '#{verification_code}';
const PHONE_VERIFICATION_TIMEZONE = 'Asia/Seoul';

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);
  private readonly dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: PHONE_VERIFICATION_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  constructor(
    private readonly sendonService: SendonService,
    private readonly configService: AppConfigService,
  ) {}

  async getProfile(userId: string): Promise<PublicProfile> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_PUBLIC_COLUMNS)
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
  ): Promise<PublicProfile> {
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
    delete updateData.is_phone_verified;
    delete updateData.phone_verification_code;
    delete updateData.phone_verification_expires_at;
    delete updateData.phone_verification_request_count;
    delete updateData.phone_verification_request_date;

    const normalizedUpdate = Object.fromEntries(
      Object.entries(updateData).filter(([, value]) => value !== undefined),
    ) as ProfileUpdate;

    if (Object.keys(normalizedUpdate).length === 0) {
      return this.getProfile(userId);
    }

    if (Object.prototype.hasOwnProperty.call(normalizedUpdate, 'phone')) {
      const profile = await this.getPhoneVerificationProfile(userId);
      const currentPhone = this.normalizePhoneForCompare(profile.phone);
      const nextPhone = this.normalizePhoneForCompare(normalizedUpdate.phone);
      if (currentPhone !== nextPhone) {
        normalizedUpdate.is_phone_verified = false;
        normalizedUpdate.phone_verification_code = null;
        normalizedUpdate.phone_verification_expires_at = null;
      }
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('profiles')
      .update(normalizedUpdate)
      .eq('id', userId)
      .select(PROFILE_PUBLIC_COLUMNS)
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

  async requestPhoneVerification(
    userId: string,
    phone?: string | null,
  ): Promise<{
    expiresIn: number;
    dailyLimit: number;
    remainingRequests: number;
    phone: string;
  }> {
    const profile = await this.getPhoneVerificationProfile(userId);
    const targetPhone = this.normalizeAndValidatePhone(
      phone ?? profile.phone,
      'phone',
    );

    const requestDate = this.getDateKeyInTimezone(new Date());
    const currentCount = this.resolveDailyRequestCount(profile, requestDate);

    if (currentCount >= PHONE_VERIFICATION_DAILY_LIMIT) {
      throw new ApiException(
        '휴대폰 인증 요청은 하루 5회까지만 가능합니다.',
        429,
        'PHONE_VERIFICATION_DAILY_LIMIT_EXCEEDED',
      );
    }

    const nextCount = currentCount + 1;
    const code = this.generateVerificationCode();
    const expiresAt = new Date(
      Date.now() + PHONE_VERIFICATION_CODE_TTL_SECONDS * 1000,
    ).toISOString();
    const phoneChanged =
      this.normalizePhoneForCompare(profile.phone) !==
      this.normalizePhoneForCompare(targetPhone);

    const updatePayload: ProfileUpdate = {
      phone: targetPhone,
      phone_verification_code: code,
      phone_verification_expires_at: expiresAt,
      phone_verification_request_count: nextCount,
      phone_verification_request_date: requestDate,
      ...(phoneChanged ? { is_phone_verified: false } : {}),
    };

    const supabase = getSupabaseClient();
    const { error: updateError } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', userId);

    if (updateError) {
      throw new ApiException(
        '휴대폰 인증 코드를 준비하지 못했습니다',
        500,
        'PHONE_VERIFICATION_PREPARE_FAILED',
      );
    }

    try {
      await this.sendPhoneVerificationCode(targetPhone, code);
    } catch (error) {
      await this.rollbackVerificationState(userId, profile, phoneChanged);
      throw error;
    }

    return {
      expiresIn: PHONE_VERIFICATION_CODE_TTL_SECONDS,
      dailyLimit: PHONE_VERIFICATION_DAILY_LIMIT,
      remainingRequests: Math.max(
        0,
        PHONE_VERIFICATION_DAILY_LIMIT - nextCount,
      ),
      phone: targetPhone,
    };
  }

  async verifyPhoneVerification(
    userId: string,
    codeInput: string,
    phoneInput?: string | null,
  ): Promise<PublicProfile> {
    const code = (codeInput || '').trim();
    if (!/^\d{6}$/.test(code)) {
      throw new ApiException(
        '올바른 인증 코드를 입력해주세요 (6자리 숫자)',
        400,
        'VALIDATION_ERROR',
      );
    }

    const profile = await this.getPhoneVerificationProfile(userId);
    if (
      !profile.phone_verification_code ||
      !profile.phone_verification_expires_at
    ) {
      throw new ApiException(
        '인증 코드를 먼저 요청해주세요.',
        400,
        'PHONE_VERIFICATION_REQUIRED',
      );
    }

    if (!profile.phone) {
      throw new ApiException(
        '휴대폰 번호를 먼저 입력해주세요',
        400,
        'PHONE_REQUIRED',
      );
    }

    const verificationPhone =
      phoneInput === undefined || phoneInput === null || phoneInput === ''
        ? profile.phone
        : this.normalizeAndValidatePhone(phoneInput, 'phone');

    if (
      this.normalizePhoneForCompare(verificationPhone) !==
      this.normalizePhoneForCompare(profile.phone)
    ) {
      throw new ApiException(
        '인증 요청한 휴대폰 번호와 일치하지 않습니다.',
        400,
        'PHONE_MISMATCH',
      );
    }

    if (
      new Date(profile.phone_verification_expires_at).getTime() < Date.now()
    ) {
      await this.clearVerificationCode(userId);
      throw new ApiException(
        '인증 코드가 만료되었습니다. 다시 요청해주세요.',
        400,
        'PHONE_VERIFICATION_EXPIRED',
      );
    }

    if (profile.phone_verification_code !== code) {
      throw new ApiException(
        '인증 코드가 올바르지 않습니다.',
        400,
        'INVALID_VERIFICATION_CODE',
      );
    }

    const updatePayload: ProfileUpdate = {
      phone: verificationPhone,
      is_phone_verified: true,
      phone_verification_code: null,
      phone_verification_expires_at: null,
    };

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('profiles')
      .update(updatePayload)
      .eq('id', userId)
      .select(PROFILE_PUBLIC_COLUMNS)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        '휴대폰 인증 처리에 실패했습니다',
        500,
        'PHONE_VERIFICATION_UPDATE_FAILED',
      );
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

  private async getPhoneVerificationProfile(
    userId: string,
  ): Promise<PhoneVerificationProfile> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id,phone,is_phone_verified,phone_verification_code,phone_verification_expires_at,phone_verification_request_count,phone_verification_request_date',
      )
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

  private async sendPhoneVerificationCode(
    phone: string,
    code: string,
  ): Promise<void> {
    const sendProfileId = this.configService.sendon.defaultSendProfileId.trim();
    if (!sendProfileId) {
      throw new ApiException(
        '카카오 발신 프로필이 설정되지 않았습니다',
        500,
        'SENDON_PROFILE_NOT_CONFIGURED',
      );
    }

    const templateId =
      this.configService.sendon.templates.phoneVerification.trim();
    if (!templateId) {
      throw new ApiException(
        '휴대폰 인증 템플릿이 설정되지 않았습니다',
        500,
        'SENDON_TEMPLATE_NOT_CONFIGURED',
      );
    }

    const result = await this.sendonService.sendAlimtalk({
      sendProfileId,
      templateId,
      to: [
        {
          phone,
          variables: {
            [PHONE_VERIFICATION_VARIABLE_KEY]: code,
          },
        },
      ],
    });

    if (result.status !== 'accepted') {
      throw new ApiException(
        '휴대폰 인증 코드 발송에 실패했습니다. 잠시 후 다시 시도해주세요.',
        502,
        'PHONE_VERIFICATION_SEND_FAILED',
      );
    }
  }

  private async rollbackVerificationState(
    userId: string,
    previous: PhoneVerificationProfile,
    restoreVerificationStatus: boolean,
  ): Promise<void> {
    const rollbackPayload: ProfileUpdate = {
      phone_verification_code: previous.phone_verification_code,
      phone_verification_expires_at: previous.phone_verification_expires_at,
      phone_verification_request_count:
        previous.phone_verification_request_count || 0,
      phone_verification_request_date: previous.phone_verification_request_date,
      ...(restoreVerificationStatus
        ? { is_phone_verified: previous.is_phone_verified }
        : {}),
    };

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('profiles')
      .update(rollbackPayload)
      .eq('id', userId);

    if (error) {
      this.logger.warn(
        `Failed to rollback phone verification state (userId=${userId}).`,
      );
    }
  }

  private async clearVerificationCode(userId: string): Promise<void> {
    const supabase = getSupabaseClient();
    await supabase
      .from('profiles')
      .update({
        phone_verification_code: null,
        phone_verification_expires_at: null,
      })
      .eq('id', userId);
  }

  private resolveDailyRequestCount(
    profile: PhoneVerificationProfile,
    requestDate: string,
  ): number {
    if (profile.phone_verification_request_date !== requestDate) {
      return 0;
    }

    return Math.max(0, profile.phone_verification_request_count || 0);
  }

  private getDateKeyInTimezone(date: Date): string {
    const parts = this.dateFormatter.formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    if (!year || !month || !day) {
      throw new ApiException(
        '휴대폰 인증 요청 날짜를 계산할 수 없습니다',
        500,
        'PHONE_VERIFICATION_DATE_RESOLVE_FAILED',
      );
    }

    return `${year}-${month}-${day}`;
  }

  private normalizeAndValidatePhone(
    phone: string | null | undefined,
    fieldName: string,
  ): string {
    if (typeof phone !== 'string' || phone.trim().length === 0) {
      throw new ApiException(
        `${fieldName}을 입력해주세요.`,
        400,
        'VALIDATION_ERROR',
      );
    }

    const normalized = phone.replace(/[\s-]/g, '');
    if (!/^\+?\d{8,15}$/.test(normalized)) {
      throw new ApiException(
        `${fieldName} 형식이 올바르지 않습니다.`,
        400,
        'VALIDATION_ERROR',
      );
    }

    return normalized;
  }

  private normalizePhoneForCompare(phone: string | null | undefined): string {
    if (!phone) {
      return '';
    }

    return phone.replace(/[^\d+]/g, '');
  }

  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
