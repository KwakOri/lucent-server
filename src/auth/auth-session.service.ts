import { Injectable } from '@nestjs/common';
import { User } from '@supabase/supabase-js';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';

@Injectable()
export class AuthSessionService {
  private adminBootstrapCache: {
    checkedAt: number;
    hasAnyActiveDbAdmin: boolean;
  } | null = null;
  private readonly adminBootstrapCacheTtlMs = 5_000;

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

  private normalizeEmail(email?: string | null): string | null {
    if (!email || typeof email !== 'string') {
      return null;
    }
    const normalized = email.trim().toLowerCase();
    return normalized || null;
  }

  private readAdminEmails(): string[] {
    return (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }

  private isBootstrapAdminEmail(email?: string | null): boolean {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) {
      return false;
    }

    const adminEmails = this.readAdminEmails();
    return adminEmails.includes(normalizedEmail);
  }

  private isRoleAssignmentActive(row: any): boolean {
    if (!row?.role?.is_active) {
      return false;
    }
    if (!row?.expires_at) {
      return true;
    }

    const expiresAt = Date.parse(row.expires_at as string);
    return Number.isNaN(expiresAt) || expiresAt > Date.now();
  }

  private async hasUserActiveDbAdminRole(userId: string): Promise<boolean> {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('v2_admin_user_roles')
      .select('role_id, expires_at, role:v2_admin_roles(is_active)')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE');

    if (error) {
      throw new ApiException(
        '관리자 권한 조회 실패',
        500,
        'ADMIN_AUTH_FETCH_FAILED',
      );
    }

    return (data || []).some((row: any) => this.isRoleAssignmentActive(row));
  }

  private async hasAnyActiveDbAdminRole(): Promise<boolean> {
    const now = Date.now();
    if (
      this.adminBootstrapCache &&
      now - this.adminBootstrapCache.checkedAt <= this.adminBootstrapCacheTtlMs
    ) {
      return this.adminBootstrapCache.hasAnyActiveDbAdmin;
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('v2_admin_user_roles')
      .select('role_id, expires_at, role:v2_admin_roles(is_active)')
      .eq('status', 'ACTIVE')
      .order('assigned_at', { ascending: false })
      .limit(500);

    if (error) {
      throw new ApiException(
        '관리자 권한 조회 실패',
        500,
        'ADMIN_AUTH_FETCH_FAILED',
      );
    }

    const hasAnyActiveDbAdmin = (data || []).some((row: any) =>
      this.isRoleAssignmentActive(row),
    );

    this.adminBootstrapCache = {
      checkedAt: now,
      hasAnyActiveDbAdmin,
    };

    return hasAnyActiveDbAdmin;
  }

  async isAdmin(input: {
    userId?: string | null;
    email?: string | null;
  }): Promise<boolean> {
    const userId =
      typeof input.userId === 'string' && input.userId.trim()
        ? input.userId.trim()
        : null;
    const email = this.normalizeEmail(input.email);

    try {
      if (userId) {
        const hasDbRole = await this.hasUserActiveDbAdminRole(userId);
        if (hasDbRole) {
          return true;
        }
      }

      if (!this.isBootstrapAdminEmail(email)) {
        return false;
      }

      const hasAnyDbAdmin = await this.hasAnyActiveDbAdminRole();
      return !hasAnyDbAdmin;
    } catch {
      // 권한 확인 실패 시 비관리자 처리(보수적 실패)
      return false;
    }
  }

  async requireAdminUser(authorizationHeader?: string): Promise<User> {
    const user = await this.requireUser(authorizationHeader);
    const hasAdminAccess = await this.isAdmin({
      userId: user.id,
      email: user.email,
    });

    if (!hasAdminAccess) {
      throw new ApiException('관리자 권한이 필요합니다', 403, 'ADMIN_REQUIRED');
    }

    return user;
  }

  isLocalAdminBypassEnabled(): boolean {
    if (process.env.NODE_ENV === 'production') {
      return false;
    }

    return this.parseBooleanEnv(process.env.LOCAL_ADMIN_BYPASS);
  }
}
