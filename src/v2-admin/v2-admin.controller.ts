import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
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

interface CutoverPolicyCheckBody {
  action_key?: string;
  requires_approval?: boolean;
}

interface CutoverDomainsQuery {
  limit?: string;
  status?: string;
}

interface UpdateCutoverDomainBody {
  status?: string;
  current_stage?: string | number;
  next_action?: string | null;
  owner_role_code?: string | null;
  last_gate_result?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface CutoverGateReportsQuery {
  limit?: string;
  domain_key?: string;
  gate_type?: string;
  gate_result?: string;
}

interface CutoverGateChecklistQuery {
  domain_key?: string;
}

interface CutoverReopenReadinessQuery {
  domain_key?: string;
}

interface SaveCutoverGateReportBody {
  domain_key?: string;
  gate_type?: string;
  gate_key?: string;
  gate_result?: string;
  measured_at?: string | null;
  threshold_json?: Record<string, unknown> | null;
  metrics_json?: Record<string, unknown> | null;
  detail?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface CutoverBatchesQuery {
  limit?: string;
  domain_key?: string;
  status?: string;
  run_type?: string;
}

interface SaveCutoverBatchBody {
  domain_key?: string;
  batch_key?: string;
  run_type?: string;
  status?: string;
  idempotency_key?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  source_snapshot?: Record<string, unknown> | null;
  result_summary?: Record<string, unknown> | null;
  error_message?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface CutoverRoutingFlagsQuery {
  limit?: string;
  domain_key?: string;
  channel?: string;
  enabled?: string;
}

interface SaveCutoverRoutingFlagBody {
  id?: string | null;
  domain_key?: string;
  channel?: string | null;
  campaign_id?: string | null;
  target?: string;
  traffic_percent?: number;
  enabled?: boolean;
  priority?: number;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface CutoverStageRunsQuery {
  limit?: string;
  domain_key?: string;
  stage_no?: string;
  status?: string;
}

interface SaveCutoverStageRunBody {
  domain_key?: string;
  stage_no?: string | number;
  run_key?: string;
  status?: string;
  transition_mode?: string;
  started_at?: string | null;
  finished_at?: string | null;
  limited_targets?: unknown[] | null;
  summary?: Record<string, unknown> | null;
  approval_note?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface CutoverStageIssuesQuery {
  limit?: string;
  domain_key?: string;
  stage_no?: string;
  status?: string;
  severity?: string;
}

interface SaveCutoverStageIssueBody {
  id?: string | null;
  stage_run_id?: string | null;
  domain_key?: string;
  stage_no?: string | number;
  status?: string;
  severity?: string;
  issue_type?: string;
  title?: string;
  detail?: string | null;
  recovery_action?: string | null;
  owner_role_code?: string | null;
  occurred_at?: string | null;
  resolved_at?: string | null;
  metadata?: Record<string, unknown> | null;
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

  @Get('actions/catalog')
  async getActionCatalog(
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.requireAdmin(authorization);
    const catalog = await this.v2AdminService.getActionCatalog();
    return successResponse(catalog);
  }

  @Get('cutover-policy')
  async getCutoverPolicy(
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.requireAdmin(authorization);
    const policy = await this.v2AdminService.getCutoverPolicy();
    return successResponse(policy);
  }

  @Post('cutover-policy/check')
  async checkCutoverPolicy(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: CutoverPolicyCheckBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2AdminService.checkCutoverPolicy({
      actionKey: body.action_key,
      requiresApproval: body.requires_approval,
    });
    return successResponse(result);
  }

  @Get('cutover/domains')
  async listCutoverDomains(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: CutoverDomainsQuery,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2AdminService.listCutoverDomains({
      limit: query.limit,
      status: query.status,
    });
    return successResponse(result);
  }

  @Patch('cutover/domains/:domainKey')
  async updateCutoverDomain(
    @Headers('authorization') authorization: string | undefined,
    @Param('domainKey') domainKey: string,
    @Body() body: UpdateCutoverDomainBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2AdminService.updateCutoverDomain(domainKey, {
      status: body.status,
      currentStage:
        body.current_stage !== undefined ? String(body.current_stage) : undefined,
      nextAction: body.next_action,
      ownerRoleCode: body.owner_role_code,
      lastGateResult: body.last_gate_result,
      metadata: body.metadata,
    });
    return successResponse(result);
  }

  @Get('cutover/gates')
  async listCutoverGateReports(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: CutoverGateReportsQuery,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2AdminService.listCutoverGateReports({
      limit: query.limit,
      domainKey: query.domain_key,
      gateType: query.gate_type,
      gateResult: query.gate_result,
    });
    return successResponse(result);
  }

  @Get('cutover/gates/checklist')
  async getCutoverGateChecklist(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: CutoverGateChecklistQuery,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2AdminService.getCutoverGateChecklist({
      domainKey: query.domain_key,
    });
    return successResponse(result);
  }

  @Get('cutover/reopen-readiness')
  async getCutoverReopenReadiness(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: CutoverReopenReadinessQuery,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2AdminService.getCutoverReopenReadiness({
      domainKey: query.domain_key,
    });
    return successResponse(result);
  }

  @Post('cutover/gates')
  async saveCutoverGateReport(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: SaveCutoverGateReportBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2AdminService.saveCutoverGateReport({
      domainKey: body.domain_key,
      gateType: body.gate_type,
      gateKey: body.gate_key,
      gateResult: body.gate_result,
      measuredAt: body.measured_at,
      thresholdJson: body.threshold_json,
      metricsJson: body.metrics_json,
      detail: body.detail,
      metadata: body.metadata,
    });
    return successResponse(result);
  }

  @Get('cutover/batches')
  async listCutoverBatches(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: CutoverBatchesQuery,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2AdminService.listCutoverBatches({
      limit: query.limit,
      domainKey: query.domain_key,
      status: query.status,
      runType: query.run_type,
    });
    return successResponse(result);
  }

  @Post('cutover/batches')
  async saveCutoverBatch(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: SaveCutoverBatchBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2AdminService.saveCutoverBatch({
      domainKey: body.domain_key,
      batchKey: body.batch_key,
      runType: body.run_type,
      status: body.status,
      idempotencyKey: body.idempotency_key,
      startedAt: body.started_at,
      finishedAt: body.finished_at,
      sourceSnapshot: body.source_snapshot,
      resultSummary: body.result_summary,
      errorMessage: body.error_message,
      metadata: body.metadata,
    });
    return successResponse(result);
  }

  @Get('cutover/routing-flags')
  async listCutoverRoutingFlags(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: CutoverRoutingFlagsQuery,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2AdminService.listCutoverRoutingFlags({
      limit: query.limit,
      domainKey: query.domain_key,
      channel: query.channel,
      enabled: query.enabled,
    });
    return successResponse(result);
  }

  @Post('cutover/routing-flags')
  async saveCutoverRoutingFlag(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: SaveCutoverRoutingFlagBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2AdminService.saveCutoverRoutingFlag({
      id: body.id,
      domainKey: body.domain_key,
      channel: body.channel,
      campaignId: body.campaign_id,
      target: body.target,
      trafficPercent: body.traffic_percent,
      enabled: body.enabled,
      priority: body.priority,
      reason: body.reason,
      metadata: body.metadata,
    });
    return successResponse(result);
  }

  @Get('cutover/stage-runs')
  async listCutoverStageRuns(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: CutoverStageRunsQuery,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2AdminService.listCutoverStageRuns({
      limit: query.limit,
      domainKey: query.domain_key,
      stageNo: query.stage_no,
      status: query.status,
    });
    return successResponse(result);
  }

  @Post('cutover/stage-runs')
  async saveCutoverStageRun(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: SaveCutoverStageRunBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2AdminService.saveCutoverStageRun({
      domainKey: body.domain_key,
      stageNo: body.stage_no,
      runKey: body.run_key,
      status: body.status,
      transitionMode: body.transition_mode,
      startedAt: body.started_at,
      finishedAt: body.finished_at,
      limitedTargets: body.limited_targets,
      summary: body.summary,
      approvalNote: body.approval_note,
      metadata: body.metadata,
    });
    return successResponse(result);
  }

  @Get('cutover/stage-issues')
  async listCutoverStageIssues(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: CutoverStageIssuesQuery,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2AdminService.listCutoverStageIssues({
      limit: query.limit,
      domainKey: query.domain_key,
      stageNo: query.stage_no,
      status: query.status,
      severity: query.severity,
    });
    return successResponse(result);
  }

  @Post('cutover/stage-issues')
  async saveCutoverStageIssue(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: SaveCutoverStageIssueBody,
  ) {
    await this.requireAdmin(authorization);
    const result = await this.v2AdminService.saveCutoverStageIssue({
      id: body.id,
      stageRunId: body.stage_run_id,
      domainKey: body.domain_key,
      stageNo: body.stage_no,
      status: body.status,
      severity: body.severity,
      issueType: body.issue_type,
      title: body.title,
      detail: body.detail,
      recoveryAction: body.recovery_action,
      ownerRoleCode: body.owner_role_code,
      occurredAt: body.occurred_at,
      resolvedAt: body.resolved_at,
      metadata: body.metadata,
    });
    return successResponse(result);
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
