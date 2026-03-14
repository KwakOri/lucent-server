import { Controller, Get, Headers, Query } from '@nestjs/common';
import { AuthSessionService } from '../auth/auth-session.service';
import { successResponse } from '../common/api-response';
import { ApiException } from '../common/errors/api.exception';
import { V2AdminService } from './v2-admin.service';

interface ActionLogQuery {
  limit?: string;
  status?: string;
  domain?: string;
}

interface ApprovalQuery {
  limit?: string;
  status?: string;
}

interface OrderQueueQuery {
  limit?: string;
  order_status?: string;
}

interface FulfillmentQueueQuery {
  limit?: string;
  kind?: string;
  status?: string;
}

interface InventoryHealthQuery {
  limit?: string;
  only_mismatches?: string;
  only_low_stock?: string;
}

@Controller('v2/admin')
export class V2AdminController {
  constructor(
    private readonly v2AdminService: V2AdminService,
    private readonly authSessionService: AuthSessionService,
  ) {}

  @Get('rbac/roles')
  async listRoles(@Headers('authorization') authorization: string | undefined) {
    await this.requireAdmin(authorization);
    const roles = await this.v2AdminService.listRoles();
    return successResponse(roles);
  }

  @Get('rbac/me')
  async getMyRbac(@Headers('authorization') authorization: string | undefined) {
    const user = await this.requireAdmin(authorization);
    const rbac = await this.v2AdminService.getMyRbac(user.id);
    return successResponse(rbac);
  }

  @Get('audit/action-logs')
  async listActionLogs(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ActionLogQuery,
  ) {
    await this.requireAdmin(authorization);
    const logs = await this.v2AdminService.listActionLogs({
      limit: query.limit,
      status: query.status,
      domain: query.domain,
    });
    return successResponse(logs);
  }

  @Get('audit/approvals')
  async listApprovals(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: ApprovalQuery,
  ) {
    await this.requireAdmin(authorization);
    const approvals = await this.v2AdminService.listApprovals({
      limit: query.limit,
      status: query.status,
    });
    return successResponse(approvals);
  }

  @Get('ops/order-queue')
  async listOrderQueue(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: OrderQueueQuery,
  ) {
    await this.requireAdmin(authorization);
    const queue = await this.v2AdminService.listOrderQueue({
      limit: query.limit,
      orderStatus: query.order_status,
    });
    return successResponse(queue);
  }

  @Get('ops/fulfillment-queue')
  async listFulfillmentQueue(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: FulfillmentQueueQuery,
  ) {
    await this.requireAdmin(authorization);
    const queue = await this.v2AdminService.listFulfillmentQueue({
      limit: query.limit,
      kind: query.kind,
      status: query.status,
    });
    return successResponse(queue);
  }

  @Get('ops/inventory-health')
  async listInventoryHealth(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: InventoryHealthQuery,
  ) {
    await this.requireAdmin(authorization);
    const health = await this.v2AdminService.listInventoryHealth({
      limit: query.limit,
      onlyMismatches: query.only_mismatches,
      onlyLowStock: query.only_low_stock,
    });
    return successResponse(health);
  }

  private async requireAdmin(authorization: string | undefined): Promise<any> {
    if (this.authSessionService.isLocalAdminBypassEnabled()) {
      return { id: 'LOCAL_ADMIN_BYPASS', email: 'local-bypass@example.com' };
    }

    const user = await this.authSessionService.requireUser(authorization);
    if (!this.authSessionService.isAdmin(user.email)) {
      throw new ApiException('관리자 권한이 필요합니다', 403, 'ADMIN_REQUIRED');
    }
    return user;
  }
}
