import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import { AuthSessionService } from '../auth/auth-session.service';
import { paginatedResponse, successResponse } from '../common/api-response';
import { ApiException } from '../common/errors/api.exception';
import { LogsService } from './logs.service';

@Controller('logs')
export class LogsController {
  constructor(
    private readonly logsService: LogsService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  @Get()
  async getLogs(
    @Headers('authorization') authorization: string | undefined,
    @Query('page') rawPage?: string,
    @Query('limit') rawLimit?: string,
    @Query('sortBy') sortBy?: 'created_at',
    @Query('order') order?: 'asc' | 'desc',
    @Query('filter[event_category]') eventCategory?: string,
    @Query('filter[event_type]') eventType?: string,
    @Query('filter[severity]')
    severity?: 'info' | 'warning' | 'error' | 'critical',
    @Query('filter[user_id]') userId?: string,
    @Query('filter[date_from]') dateFrom?: string,
    @Query('filter[date_to]') dateTo?: string,
    @Query('search') search?: string,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    if (!this.authSessionService.isAdmin(user.email)) {
      throw new ApiException('관리자 권한이 필요합니다', 403, 'UNAUTHORIZED');
    }

    const page = this.parseOrDefault(rawPage, 1);
    const limit = Math.min(this.parseOrDefault(rawLimit, 50), 200);

    const result = await this.logsService.getLogs({
      page,
      limit,
      sortBy: sortBy || 'created_at',
      order: order || 'desc',
      eventCategory,
      eventType,
      severity,
      userId,
      dateFrom,
      dateTo,
      search,
    });

    return paginatedResponse(result.logs, {
      total: result.total,
      page,
      limit,
    });
  }

  @Get('stats')
  async getStats(
    @Headers('authorization') authorization: string | undefined,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    if (!this.authSessionService.isAdmin(user.email)) {
      throw new ApiException('관리자 권한이 필요합니다', 403, 'UNAUTHORIZED');
    }

    const stats = await this.logsService.getStats({ dateFrom, dateTo });
    return successResponse(stats);
  }

  @Get(':id')
  async getLogById(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') id: string,
  ) {
    const user = await this.authSessionService.requireUser(authorization);
    if (!this.authSessionService.isAdmin(user.email)) {
      throw new ApiException('관리자 권한이 필요합니다', 403, 'UNAUTHORIZED');
    }

    const log = await this.logsService.getLogById(id);
    if (!log) {
      throw new ApiException('로그를 찾을 수 없습니다', 404, 'LOG_NOT_FOUND');
    }

    return successResponse(log);
  }

  private parseOrDefault(raw: string | undefined, fallback: number): number {
    if (!raw) {
      return fallback;
    }

    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new ApiException(
        '유효하지 않은 숫자 값입니다',
        400,
        'VALIDATION_ERROR',
      );
    }

    return parsed;
  }
}
