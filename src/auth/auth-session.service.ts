import { Injectable } from '@nestjs/common';
import { User } from '@supabase/supabase-js';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';

@Injectable()
export class AuthSessionService {
  private parseBooleanEnv(value?: string): boolean {
    if (!value) {
      return false;
    }

    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }

  extractAccessToken(authorizationHeader?: string): string | null {
    if (!authorizationHeader) {
      return null;
    }

    const [scheme, token] = authorizationHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }

    return token.trim();
  }

  async getUserFromAccessToken(accessToken: string): Promise<User | null> {
    if (!accessToken) {
      return null;
    }

    const supabase = getSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return null;
    }

    return user;
  }

  async getUserFromAuthorizationHeader(
    authorizationHeader?: string,
  ): Promise<User | null> {
    const accessToken = this.extractAccessToken(authorizationHeader);
    if (!accessToken) {
      return null;
    }

    return this.getUserFromAccessToken(accessToken);
  }

  async requireUser(authorizationHeader?: string): Promise<User> {
    const user = await this.getUserFromAuthorizationHeader(authorizationHeader);
    if (!user) {
      throw new ApiException('로그인이 필요합니다', 401, 'UNAUTHENTICATED');
    }

    return user;
  }

  isAdmin(email?: string | null): boolean {
    if (!email) {
      return false;
    }

    const adminEmails = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    return adminEmails.includes(email.toLowerCase());
  }

  isLocalAdminBypassEnabled(): boolean {
    if (process.env.NODE_ENV === 'production') {
      return false;
    }

    return this.parseBooleanEnv(process.env.LOCAL_ADMIN_BYPASS);
  }
}
