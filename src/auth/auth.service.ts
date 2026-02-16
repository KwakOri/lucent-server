import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ApiException } from '../common/errors/api.exception';
import {
  getSupabaseAnonClient,
  getSupabaseClient,
} from '../supabase/supabase.client';
import { Tables } from '../types/database';
import { AuthMailService } from './auth-mail.service';
import { AuthSessionService } from './auth-session.service';

type EmailVerificationRecord = Tables<'email_verifications'>;

type SessionUserSummary = {
  user: {
    id: string;
    email: string | undefined;
    name: string | undefined;
  };
  session: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number | null;
  };
};

@Injectable()
export class AuthService {
  private readonly verificationCodeTtlSeconds = 600;
  private readonly passwordResetTtlSeconds = 600;
  private readonly resendCooldownSeconds = 60;

  constructor(
    private readonly authMailService: AuthMailService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  async sendVerification(email: string, password: string) {
    this.validateSignupInput(email, password);

    const supabase = getSupabaseClient();

    await this.ensureEmailAvailable(email);
    await this.ensureResendCooldown(email);

    const code = this.generateVerificationCode();
    const token = randomUUID();
    const expiresAt = new Date(
      Date.now() + this.verificationCodeTtlSeconds * 1000,
    ).toISOString();

    const { error: cleanupError } = await supabase
      .from('email_verifications')
      .delete()
      .eq('email', email)
      .eq('purpose', 'signup');

    if (cleanupError) {
      throw new ApiException(
        '인증 코드 생성에 실패했습니다',
        500,
        'VERIFICATION_CREATE_FAILED',
      );
    }

    const { error: insertError } = await supabase
      .from('email_verifications')
      .insert({
        email,
        code,
        token,
        hashed_password: password,
        purpose: 'signup',
        expires_at: expiresAt,
        attempts: 0,
      });

    if (insertError) {
      throw new ApiException(
        '인증 코드 생성에 실패했습니다',
        500,
        'VERIFICATION_CREATE_FAILED',
      );
    }

    try {
      await this.authMailService.sendVerificationEmail({ email, code, token });
    } catch (error) {
      await supabase.from('email_verifications').delete().eq('token', token);
      throw error;
    }

    return {
      email,
      expiresIn: this.verificationCodeTtlSeconds,
    };
  }

  async verifyCode(email: string, code: string): Promise<string> {
    if (!email || !code) {
      throw new ApiException(
        '이메일과 인증 코드를 입력해주세요',
        400,
        'VALIDATION_ERROR',
      );
    }

    if (!/^\d{6}$/.test(code)) {
      throw new ApiException(
        '올바른 인증 코드를 입력해주세요 (6자리 숫자)',
        400,
        'VALIDATION_ERROR',
      );
    }

    const supabase = getSupabaseClient();
    const { data: verification, error } = await supabase
      .from('email_verifications')
      .select('*')
      .eq('email', email)
      .eq('code', code)
      .eq('purpose', 'signup')
      .is('verified_at', null)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        '인증 코드 검증에 실패했습니다',
        500,
        'VERIFICATION_CHECK_FAILED',
      );
    }

    if (!verification) {
      await this.incrementAttempts(email);
      throw new ApiException(
        '잘못된 인증 코드입니다',
        400,
        'INVALID_VERIFICATION_CODE',
      );
    }

    if ((verification.attempts || 0) >= 5) {
      throw new ApiException(
        '인증 시도 횟수를 초과했습니다. 코드를 재발송해주세요.',
        429,
        'VERIFICATION_ATTEMPTS_EXCEEDED',
      );
    }

    this.assertNotExpired(
      verification.expires_at,
      '인증 코드가 만료되었습니다. 코드를 재발송해주세요.',
      'VERIFICATION_EXPIRED',
    );

    const { error: updateError } = await supabase
      .from('email_verifications')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', verification.id);

    if (updateError) {
      throw new ApiException(
        '인증 처리에 실패했습니다',
        500,
        'VERIFICATION_UPDATE_FAILED',
      );
    }

    return verification.token;
  }

  async verifyEmailToken(token: string): Promise<void> {
    if (!token) {
      throw new ApiException(
        '인증 토큰이 없습니다. 다시 시도해주세요.',
        400,
        'NO_TOKEN',
      );
    }

    const verification = await this.getPendingVerificationByToken(
      token,
      'signup',
    );
    this.assertNotExpired(
      verification.expires_at,
      '인증 링크가 만료되었습니다',
      'VERIFICATION_EXPIRED',
    );

    const supabase = getSupabaseClient();
    const { error: updateError } = await supabase
      .from('email_verifications')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', verification.id);

    if (updateError) {
      throw new ApiException(
        '인증 처리에 실패했습니다',
        500,
        'VERIFICATION_UPDATE_FAILED',
      );
    }
  }

  async signupWithVerification(
    email: string | undefined,
    verificationToken: string,
  ) {
    if (!verificationToken) {
      throw new ApiException('인증 토큰이 필요합니다', 400, 'VALIDATION_ERROR');
    }

    const supabase = getSupabaseClient();
    const { data: verification, error } = await supabase
      .from('email_verifications')
      .select('*')
      .eq('token', verificationToken)
      .eq('purpose', 'signup')
      .not('verified_at', 'is', null)
      .maybeSingle();

    if (error || !verification) {
      throw new ApiException(
        '유효하지 않은 인증 토큰입니다',
        400,
        'INVALID_VERIFICATION_TOKEN',
      );
    }

    this.assertNotExpired(
      verification.expires_at,
      '인증 토큰이 만료되었습니다',
      'VERIFICATION_EXPIRED',
    );

    if (email && verification.email !== email) {
      throw new ApiException(
        '이메일이 일치하지 않습니다',
        400,
        'EMAIL_MISMATCH',
      );
    }

    const userEmail = email || verification.email;
    const password = verification.hashed_password || '';

    if (!password) {
      throw new ApiException(
        '인증 데이터가 올바르지 않습니다',
        400,
        'INVALID_VERIFICATION_DATA',
      );
    }

    const { data: authData, error: createUserError } =
      await supabase.auth.admin.createUser({
        email: userEmail,
        password,
        email_confirm: true,
        user_metadata: {
          email_verified: true,
        },
      });

    if (createUserError || !authData.user) {
      const isDuplicate = createUserError?.message
        ?.toLowerCase()
        .includes('already');
      if (isDuplicate) {
        throw new ApiException(
          '이미 가입된 이메일입니다',
          400,
          'EMAIL_ALREADY_EXISTS',
        );
      }

      throw new ApiException('회원가입에 실패했습니다', 500, 'SIGNUP_FAILED');
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: authData.user.id,
      email: userEmail,
      name: null,
      phone: null,
      main_address: null,
      detail_address: null,
    });

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw new ApiException(
        '프로필 생성에 실패했습니다',
        500,
        'PROFILE_CREATE_FAILED',
      );
    }

    const authClient = getSupabaseAnonClient();
    const { data: sessionData, error: loginError } =
      await authClient.auth.signInWithPassword({
        email: userEmail,
        password,
      });

    if (loginError || !sessionData.session) {
      throw new ApiException(
        '로그인에 실패했습니다. 로그인 페이지에서 다시 시도해주세요.',
        500,
        'SESSION_CREATE_FAILED',
      );
    }

    await supabase
      .from('email_verifications')
      .delete()
      .eq('token', verificationToken);

    return {
      user: {
        id: authData.user.id,
        email: authData.user.email,
      },
      session: {
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
      },
    };
  }

  async login(email: string, password: string): Promise<SessionUserSummary> {
    if (!email || !password) {
      throw new ApiException(
        '이메일과 비밀번호를 입력해주세요',
        400,
        'VALIDATION_ERROR',
      );
    }

    const authClient = getSupabaseAnonClient();
    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user || !data.session) {
      throw new ApiException(
        '이메일 또는 비밀번호가 올바르지 않습니다',
        401,
        'INVALID_CREDENTIALS',
      );
    }

    return {
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name,
      },
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: data.session.expires_at || null,
      },
    };
  }

  async logout(authorizationHeader?: string): Promise<void> {
    await this.authSessionService.requireUser(authorizationHeader);
  }

  async getSession(authorizationHeader?: string) {
    const user =
      await this.authSessionService.getUserFromAuthorizationHeader(
        authorizationHeader,
      );
    if (!user) {
      return null;
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name,
      },
      isAdmin: this.authSessionService.isAdmin(user.email),
    };
  }

  async requestPasswordReset(email: string): Promise<void> {
    if (!email) {
      throw new ApiException('이메일을 입력해주세요', 400, 'VALIDATION_ERROR');
    }

    this.validateEmail(email);

    const supabase = getSupabaseClient();
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (profileError) {
      throw new ApiException(
        '비밀번호 재설정 요청에 실패했습니다',
        500,
        'RESET_REQUEST_FAILED',
      );
    }

    if (!profile) {
      return;
    }

    const token = randomUUID();
    const expiresAt = new Date(
      Date.now() + this.passwordResetTtlSeconds * 1000,
    ).toISOString();

    await supabase
      .from('email_verifications')
      .delete()
      .eq('email', email)
      .eq('purpose', 'reset_password')
      .is('verified_at', null);

    const { error: insertError } = await supabase
      .from('email_verifications')
      .insert({
        email,
        token,
        purpose: 'reset_password',
        expires_at: expiresAt,
        attempts: 0,
        code: null,
        hashed_password: null,
      });

    if (insertError) {
      throw new ApiException(
        '비밀번호 재설정 요청에 실패했습니다',
        500,
        'RESET_REQUEST_FAILED',
      );
    }

    try {
      await this.authMailService.sendPasswordResetEmail(email, token);
    } catch (error) {
      await supabase.from('email_verifications').delete().eq('token', token);
      throw error;
    }
  }

  async updatePassword(
    token: string,
    newPassword: string,
  ): Promise<{ email: string }> {
    if (!token || !newPassword) {
      throw new ApiException(
        '토큰과 새 비밀번호를 입력해주세요',
        400,
        'VALIDATION_ERROR',
      );
    }

    if (newPassword.length < 8) {
      throw new ApiException(
        '비밀번호는 최소 8자 이상이어야 합니다',
        400,
        'PASSWORD_TOO_SHORT',
      );
    }

    const supabase = getSupabaseClient();
    const { data: verification, error } = await supabase
      .from('email_verifications')
      .select('*')
      .eq('token', token)
      .eq('purpose', 'reset_password')
      .maybeSingle();

    if (error || !verification) {
      throw new ApiException(
        '유효하지 않은 재설정 토큰입니다',
        400,
        'INVALID_TOKEN',
      );
    }

    if (verification.verified_at) {
      throw new ApiException(
        '이미 사용된 재설정 토큰입니다',
        400,
        'TOKEN_ALREADY_USED',
      );
    }

    this.assertNotExpired(
      verification.expires_at,
      '재설정 토큰이 만료되었습니다',
      'TOKEN_EXPIRED',
    );

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', verification.email)
      .maybeSingle();

    if (profileError || !profile) {
      throw new ApiException(
        '사용자를 찾을 수 없습니다',
        404,
        'USER_NOT_FOUND',
      );
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      profile.id,
      {
        password: newPassword,
      },
    );

    if (updateError) {
      throw new ApiException(
        '비밀번호 변경에 실패했습니다',
        500,
        'PASSWORD_UPDATE_FAILED',
      );
    }

    await supabase
      .from('email_verifications')
      .update({ verified_at: new Date().toISOString() })
      .eq('token', token);

    return { email: verification.email };
  }

  getVerificationSuccessRedirect(token: string): string {
    const redirectUrl = new URL('/signup/complete', this.getFrontendAppUrl());
    redirectUrl.searchParams.set('verified', 'true');
    redirectUrl.searchParams.set('token', token);
    return redirectUrl.toString();
  }

  getVerificationErrorRedirect(errorCode: string, message: string): string {
    const redirectUrl = new URL('/signup', this.getFrontendAppUrl());
    redirectUrl.searchParams.set('error', errorCode);
    redirectUrl.searchParams.set('message', message);
    return redirectUrl.toString();
  }

  private async ensureEmailAvailable(email: string): Promise<void> {
    const supabase = getSupabaseClient();

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (profileError) {
      throw new ApiException(
        '이메일 중복 확인에 실패했습니다',
        500,
        'EMAIL_CHECK_FAILED',
      );
    }

    if (profile) {
      throw new ApiException(
        '이미 가입된 이메일입니다',
        400,
        'EMAIL_ALREADY_EXISTS',
      );
    }

    const { data: usersData, error: usersError } =
      await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

    const hasExistingUser =
      !usersError &&
      usersData?.users?.some((user) => {
        const authUser = user as { email?: string | null };
        return authUser.email?.toLowerCase() === email.toLowerCase();
      });

    if (hasExistingUser) {
      throw new ApiException(
        '이미 가입된 이메일입니다',
        400,
        'EMAIL_ALREADY_EXISTS',
      );
    }
  }

  private async ensureResendCooldown(email: string): Promise<void> {
    const supabase = getSupabaseClient();
    const { data: verification, error } = await supabase
      .from('email_verifications')
      .select('created_at')
      .eq('email', email)
      .eq('purpose', 'signup')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        '인증 코드 발송 가능 여부 확인에 실패했습니다',
        500,
        'VERIFICATION_CHECK_FAILED',
      );
    }

    if (!verification) {
      return;
    }

    const elapsedSeconds = Math.floor(
      (Date.now() - new Date(verification.created_at).getTime()) / 1000,
    );

    if (elapsedSeconds < this.resendCooldownSeconds) {
      throw new ApiException(
        '이메일 재발송은 60초 후에 가능합니다. 잠시 후 다시 시도해주세요.',
        429,
        'VERIFICATION_COOLDOWN',
      );
    }
  }

  private async getPendingVerificationByToken(
    token: string,
    purpose: 'signup' | 'reset_password',
  ): Promise<EmailVerificationRecord> {
    const supabase = getSupabaseClient();
    const { data: verification, error } = await supabase
      .from('email_verifications')
      .select('*')
      .eq('token', token)
      .eq('purpose', purpose)
      .is('verified_at', null)
      .maybeSingle();

    if (error || !verification) {
      throw new ApiException(
        '유효하지 않은 인증 링크입니다',
        400,
        'INVALID_VERIFICATION_TOKEN',
      );
    }

    return verification;
  }

  private async incrementAttempts(email: string): Promise<void> {
    const supabase = getSupabaseClient();
    await supabase.rpc('increment_verification_attempts', { p_email: email });
  }

  private validateSignupInput(email: string, password: string): void {
    if (!email || !password) {
      throw new ApiException(
        '이메일과 비밀번호를 입력해주세요',
        400,
        'VALIDATION_ERROR',
      );
    }

    this.validateEmail(email);

    if (password.length < 6) {
      throw new ApiException(
        '비밀번호는 최소 6자 이상이어야 합니다',
        400,
        'PASSWORD_TOO_SHORT',
      );
    }
  }

  private validateEmail(email: string): void {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(email)) {
      throw new ApiException(
        '올바른 이메일 형식을 입력해주세요',
        400,
        'INVALID_EMAIL',
      );
    }
  }

  private assertNotExpired(
    expiresAt: string,
    message: string,
    errorCode: string,
  ): void {
    if (new Date(expiresAt).getTime() < Date.now()) {
      throw new ApiException(message, 400, errorCode);
    }
  }

  private generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private getFrontendAppUrl(): string {
    return (
      process.env.FRONTEND_APP_URL ||
      process.env.APP_URL ||
      'http://localhost:3000'
    );
  }
}
