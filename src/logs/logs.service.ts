import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';
import { Json, Tables, TablesInsert } from '../types/database';

type Severity = 'info' | 'warning' | 'error' | 'critical';
type LogRow = Tables<'logs'>;

interface LogEventInput {
  eventType: string;
  eventCategory?: string;
  severity?: Severity;
  userId?: string | null;
  adminId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  message: string;
  metadata?: Record<string, Json> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestPath?: string | null;
  changes?: Record<string, Json> | null;
}

interface GetLogsOptions {
  page?: number;
  limit?: number;
  sortBy?: 'created_at';
  order?: 'asc' | 'desc';
  eventCategory?: string;
  eventType?: string;
  severity?: Severity;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface LogWithRelations extends LogRow {
  user?: {
    email: string;
    name: string | null;
  } | null;
  admin?: {
    email: string;
    name: string | null;
  } | null;
}

@Injectable()
export class LogsService {
  /**
   * 로그 기록 실패로 인해 서비스가 중단되지 않도록 예외를 삼킨다.
   */
  async log(input: LogEventInput): Promise<void> {
    try {
      const supabase = getSupabaseClient();
      const eventCategory =
        input.eventCategory || input.eventType.split('.')[0];

      const logData: TablesInsert<'logs'> = {
        event_type: input.eventType,
        event_category: eventCategory,
        severity: input.severity || 'info',
        user_id: input.userId || null,
        admin_id: input.adminId || null,
        resource_type: input.resourceType || null,
        resource_id: input.resourceId || null,
        message: input.message,
        metadata: input.metadata || null,
        ip_address: input.ipAddress || null,
        user_agent: input.userAgent || null,
        request_path: input.requestPath || null,
        changes: input.changes || null,
      };

      await supabase.from('logs').insert(logData);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[LogsService] failed to write log', error);
    }
  }

  async getLogs(
    options: GetLogsOptions = {},
  ): Promise<{ logs: LogWithRelations[]; total: number }> {
    const supabase = getSupabaseClient();
    const {
      page = 1,
      limit = 50,
      sortBy = 'created_at',
      order = 'desc',
      eventCategory,
      eventType,
      severity,
      userId,
      dateFrom,
      dateTo,
      search,
    } = options;

    let query = supabase.from('logs').select(
      `
        *,
        user:profiles!logs_user_id_fkey (
          email,
          name
        ),
        admin:profiles!logs_admin_id_fkey (
          email,
          name
        )
      `,
      { count: 'exact' },
    );

    if (eventCategory) {
      query = query.eq('event_category', eventCategory);
    }
    if (eventType) {
      query = query.eq('event_type', eventType);
    }
    if (severity) {
      query = query.eq('severity', severity);
    }
    if (userId) {
      query = query.eq('user_id', userId);
    }
    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }
    if (search) {
      query = query.ilike('message', `%${search}%`);
    }

    query = query.order(sortBy, { ascending: order === 'asc' });

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      throw new ApiException('로그 목록 조회 실패', 500, 'LOG_FETCH_FAILED');
    }

    return {
      logs: (data || []) as LogWithRelations[],
      total: count || 0,
    };
  }

  async getLogById(id: string): Promise<LogWithRelations | null> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('logs')
      .select(
        `
        *,
        user:profiles!logs_user_id_fkey (
          email,
          name
        ),
        admin:profiles!logs_admin_id_fkey (
          email,
          name
        )
      `,
      )
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new ApiException('로그 조회 실패', 500, 'LOG_FETCH_FAILED');
    }

    return (data as LogWithRelations | null) || null;
  }

  async getStats(options: { dateFrom?: string; dateTo?: string }): Promise<{
    total: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
  }> {
    const supabase = getSupabaseClient();
    const { dateFrom, dateTo } = options;

    let totalQuery = supabase
      .from('logs')
      .select('*', { count: 'exact', head: true });

    if (dateFrom) {
      totalQuery = totalQuery.gte('created_at', dateFrom);
    }
    if (dateTo) {
      totalQuery = totalQuery.lte('created_at', dateTo);
    }

    const { count: total, error: totalError } = await totalQuery;
    if (totalError) {
      throw new ApiException(
        '로그 통계 조회 실패',
        500,
        'LOG_STATS_FETCH_FAILED',
      );
    }

    let categoryQuery = supabase.from('logs').select('event_category');
    if (dateFrom) {
      categoryQuery = categoryQuery.gte('created_at', dateFrom);
    }
    if (dateTo) {
      categoryQuery = categoryQuery.lte('created_at', dateTo);
    }

    const { data: categoryData, error: categoryError } = await categoryQuery;
    if (categoryError) {
      throw new ApiException(
        '로그 통계 조회 실패',
        500,
        'LOG_STATS_FETCH_FAILED',
      );
    }

    const byCategory: Record<string, number> = {};
    (categoryData || []).forEach((row: { event_category: string }) => {
      byCategory[row.event_category] =
        (byCategory[row.event_category] || 0) + 1;
    });

    let severityQuery = supabase.from('logs').select('severity');
    if (dateFrom) {
      severityQuery = severityQuery.gte('created_at', dateFrom);
    }
    if (dateTo) {
      severityQuery = severityQuery.lte('created_at', dateTo);
    }

    const { data: severityData, error: severityError } = await severityQuery;
    if (severityError) {
      throw new ApiException(
        '로그 통계 조회 실패',
        500,
        'LOG_STATS_FETCH_FAILED',
      );
    }

    const bySeverity: Record<string, number> = {};
    (severityData || []).forEach((row: { severity: string }) => {
      bySeverity[row.severity] = (bySeverity[row.severity] || 0) + 1;
    });

    return {
      total: total || 0,
      byCategory,
      bySeverity,
    };
  }
}
