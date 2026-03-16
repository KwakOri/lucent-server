import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';

@Injectable()
export class V2AdminService {
  private readonly requiredCutoverGateTypes = [
    'DATA_CONSISTENCY',
    'BEHAVIORAL',
    'OPERATIONS',
    'ROLLBACK_READY',
  ] as const;

  private get supabase(): any {
    return getSupabaseClient() as any;
  }

  async getCutoverPolicy(): Promise<any> {
    const stage = this.readRolloutStage();
    const approvalEnforced = this.readBooleanEnv(
      'V2_ADMIN_APPROVAL_ENFORCED',
      false,
    );
    const enforcedActions = this.readCsvEnv('V2_ADMIN_APPROVAL_ENFORCED_ACTIONS');

    return {
      rollout_stage: stage,
      approval_enforced: approvalEnforced,
      approval_enforced_actions: enforcedActions,
      legacy_write_mode: this.readLegacyWriteMode(stage),
      description: this.describeStage(stage),
      updated_at: new Date().toISOString(),
    };
  }

  async checkCutoverPolicy(input: {
    actionKey?: string;
    requiresApproval?: boolean;
  }): Promise<any> {
    const policy = await this.getCutoverPolicy();
    const actionKey = this.normalizeOptionalText(input.actionKey);
    const requiresApproval = Boolean(input.requiresApproval);

    let approvalEnforcedForAction = false;
    if (policy.approval_enforced && requiresApproval) {
      if (!actionKey) {
        approvalEnforcedForAction = true;
      } else if (
        !Array.isArray(policy.approval_enforced_actions) ||
        policy.approval_enforced_actions.length === 0
      ) {
        approvalEnforcedForAction = true;
      } else {
        approvalEnforcedForAction = policy.approval_enforced_actions.includes(
          actionKey,
        );
      }
    }

    return {
      policy,
      action: {
        action_key: actionKey,
        requires_approval: requiresApproval,
        approval_enforced_for_action: approvalEnforcedForAction,
      },
      decision: approvalEnforcedForAction ? 'APPROVAL_REQUIRED' : 'DIRECT_EXECUTE',
    };
  }

  async getActionCatalog(): Promise<any> {
    return {
      generated_at: new Date().toISOString(),
      screens: [
        {
          screen_key: 'order-ops',
          screen_name: 'Order Ops',
          actions: [
            {
              action_key: 'ORDER_REFUND_EXECUTE',
              domain: 'ORDER',
              resource_type: 'ORDER',
              required_permission_code: 'ORDER_REFUND_APPROVE',
              requires_approval: true,
              approval_role_code: 'FINANCE_MANAGER',
              endpoint: 'POST /api/v2/checkout/orders/:orderId/refund',
              transition_key: 'ORDER_REFUND',
            },
            {
              action_key: 'ORDER_QUEUE_BULK_ACTION',
              domain: 'ORDER',
              resource_type: 'ORDER',
              required_permission_code: null,
              requires_approval: false,
              approval_role_code: null,
              endpoint: 'POST /api/v2/admin/ops/orders/bulk-actions',
              transition_key: 'ORDER_BULK_ACTION_REQUESTED',
            },
          ],
        },
        {
          screen_key: 'fulfillment-ops',
          screen_name: 'Fulfillment Ops',
          actions: [
            {
              action_key: 'FULFILLMENT_SHIPMENT_DISPATCH',
              domain: 'FULFILLMENT',
              resource_type: 'SHIPMENT',
              required_permission_code: 'FULFILLMENT_EXECUTE',
              requires_approval: false,
              approval_role_code: null,
              endpoint:
                'POST /api/v2/fulfillment/admin/shipments/:shipmentId/dispatch',
              transition_key: 'SHIPMENT_DISPATCH',
            },
          ],
        },
        {
          screen_key: 'digital-ops',
          screen_name: 'Digital Ops',
          actions: [
            {
              action_key: 'FULFILLMENT_ENTITLEMENT_REISSUE',
              domain: 'FULFILLMENT',
              resource_type: 'DIGITAL_ENTITLEMENT',
              required_permission_code: 'ENTITLEMENT_REISSUE',
              requires_approval: false,
              approval_role_code: null,
              endpoint:
                'POST /api/v2/fulfillment/admin/entitlements/:entitlementId/reissue',
              transition_key: 'ENTITLEMENT_REISSUE',
            },
            {
              action_key: 'FULFILLMENT_ENTITLEMENT_REVOKE',
              domain: 'FULFILLMENT',
              resource_type: 'DIGITAL_ENTITLEMENT',
              required_permission_code: 'ENTITLEMENT_REISSUE',
              requires_approval: true,
              approval_role_code: 'OPS_MANAGER',
              endpoint:
                'POST /api/v2/fulfillment/admin/entitlements/:entitlementId/revoke',
              transition_key: 'ENTITLEMENT_REVOKE',
            },
          ],
        },
      ],
    };
  }

  async listCutoverDomains(params: {
    limit?: string;
    status?: string;
  }): Promise<any> {
    const limit = this.normalizeLimit(params.limit);
    let query = this.supabase
      .from('v2_cutover_domains')
      .select('*')
      .order('current_stage', { ascending: true })
      .order('domain_key', { ascending: true })
      .limit(limit);

    const status = this.normalizeOptionalText(params.status);
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiException(
        'cutover domain 조회 실패',
        500,
        'V2_CUTOVER_DOMAINS_FETCH_FAILED',
      );
    }

    return {
      items: data || [],
      limit,
    };
  }

  async updateCutoverDomain(
    domainKey: string,
    input: {
      status?: string;
      currentStage?: string;
      nextAction?: string | null;
      ownerRoleCode?: string | null;
      lastGateResult?: string | null;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<any> {
    const normalizedDomainKey = this.normalizeRequiredText(
      domainKey,
      'domain_key가 필요합니다',
    );
    const domain = await this.requireCutoverDomain(normalizedDomainKey);

    const updates: Record<string, unknown> = {};

    const status = this.normalizeOptionalText(input.status);
    if (status) {
      updates.status = status;
    }

    if (input.currentStage !== undefined) {
      const parsedStage = Number.parseInt(input.currentStage, 10);
      if (!Number.isInteger(parsedStage) || parsedStage < 0 || parsedStage > 8) {
        throw new ApiException(
          'current_stage는 0~8 범위의 정수여야 합니다',
          400,
          'V2_CUTOVER_STAGE_INVALID',
        );
      }
      updates.current_stage = parsedStage;
    }

    if (input.nextAction !== undefined) {
      updates.next_action = this.normalizeOptionalText(input.nextAction);
    }
    if (input.ownerRoleCode !== undefined) {
      updates.owner_role_code = this.normalizeOptionalText(input.ownerRoleCode);
    }
    if (input.lastGateResult !== undefined) {
      updates.last_gate_result = this.normalizeOptionalText(input.lastGateResult);
    }
    if (input.metadata !== undefined) {
      updates.metadata = this.normalizeOptionalJsonObject(input.metadata) || {};
    }

    if (Object.keys(updates).length === 0) {
      return domain;
    }

    const { data, error } = await this.supabase
      .from('v2_cutover_domains')
      .update(updates)
      .eq('id', domain.id)
      .select('*')
      .maybeSingle();

    if (error || !data) {
      throw new ApiException(
        'cutover domain 업데이트 실패',
        500,
        'V2_CUTOVER_DOMAIN_UPDATE_FAILED',
      );
    }

    return data;
  }

  async listCutoverGateReports(params: {
    limit?: string;
    domainKey?: string;
    gateType?: string;
    gateResult?: string;
  }): Promise<any> {
    const limit = this.normalizeLimit(params.limit);
    let query = this.supabase
      .from('v2_cutover_gate_reports')
      .select(
        '*, domain:v2_cutover_domains(domain_key,domain_name,status,current_stage)',
      )
      .order('measured_at', { ascending: false })
      .limit(limit);

    const gateType = this.normalizeOptionalText(params.gateType);
    if (gateType) {
      query = query.eq('gate_type', gateType);
    }

    const gateResult = this.normalizeOptionalText(params.gateResult);
    if (gateResult) {
      query = query.eq('gate_result', gateResult);
    }

    const domainKey = this.normalizeOptionalText(params.domainKey);
    if (domainKey) {
      const domain = await this.requireCutoverDomain(domainKey);
      query = query.eq('domain_id', domain.id);
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiException(
        'cutover gate report 조회 실패',
        500,
        'V2_CUTOVER_GATE_REPORTS_FETCH_FAILED',
      );
    }

    return {
      items: data || [],
      limit,
    };
  }

  async getCutoverGateChecklist(params: { domainKey?: string }): Promise<any> {
    const domainKey = this.normalizeOptionalText(params.domainKey);
    let domains: any[] = [];

    if (domainKey) {
      const domain = await this.requireCutoverDomain(domainKey);
      domains = [domain];
    } else {
      const { data, error } = await this.supabase
        .from('v2_cutover_domains')
        .select('*')
        .order('current_stage', { ascending: true })
        .order('domain_key', { ascending: true });

      if (error) {
        throw new ApiException(
          'cutover domain checklist 조회 실패',
          500,
          'V2_CUTOVER_CHECKLIST_DOMAINS_FETCH_FAILED',
        );
      }
      domains = data || [];
    }

    if (domains.length === 0) {
      return {
        generated_at: new Date().toISOString(),
        required_gate_types: [...this.requiredCutoverGateTypes],
        domains: [],
        summary: {
          total_domains: 0,
          ready_count: 0,
          review_count: 0,
          blocked_count: 0,
        },
      };
    }

    const domainIds = domains.map((domain) => domain.id).filter(Boolean);
    const { data: reports, error: reportsError } = await this.supabase
      .from('v2_cutover_gate_reports')
      .select(
        'id,domain_id,gate_type,gate_key,gate_result,measured_at,detail,threshold_json,metrics_json,metadata',
      )
      .in('domain_id', domainIds)
      .order('measured_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (reportsError) {
      throw new ApiException(
        'cutover gate checklist report 조회 실패',
        500,
        'V2_CUTOVER_CHECKLIST_REPORTS_FETCH_FAILED',
      );
    }

    const latestReportByDomainGate = new Map<string, any>();
    for (const report of reports || []) {
      const gateType = report.gate_type as string;
      if (!this.requiredCutoverGateTypes.includes(gateType as any)) {
        continue;
      }
      const key = `${report.domain_id}:${gateType}`;
      if (!latestReportByDomainGate.has(key)) {
        latestReportByDomainGate.set(key, report);
      }
    }

    const checklistDomains = domains.map((domain) => {
      const gateChecks = this.requiredCutoverGateTypes.map((gateType) => {
        const report =
          latestReportByDomainGate.get(`${domain.id}:${gateType}`) || null;
        const gateResult = (report?.gate_result as string | null) || null;
        const isPassed = gateResult === 'PASS';
        const isWarn = gateResult === 'WARN';
        const isFailed = gateResult === 'FAIL';
        const isMissing = !gateResult || gateResult === 'SKIP';

        return {
          gate_type: gateType,
          latest_result: gateResult,
          latest_at: report?.measured_at || null,
          detail: report?.detail || null,
          report_id: report?.id || null,
          passed: isPassed,
          warn: isWarn,
          failed: isFailed,
          missing: isMissing,
          blocking: isFailed || isMissing,
        };
      });

      const summary = {
        required_total: gateChecks.length,
        passed: gateChecks.filter((item) => item.passed).length,
        warn: gateChecks.filter((item) => item.warn).length,
        failed: gateChecks.filter((item) => item.failed).length,
        missing: gateChecks.filter((item) => item.missing).length,
      };

      const decision =
        summary.failed > 0 || summary.missing > 0
          ? 'BLOCKED'
          : summary.warn > 0
          ? 'REVIEW'
          : 'READY';

      return {
        domain: {
          id: domain.id,
          domain_key: domain.domain_key,
          domain_name: domain.domain_name,
          status: domain.status,
          current_stage: domain.current_stage,
          next_action: domain.next_action,
          owner_role_code: domain.owner_role_code,
          last_gate_result: domain.last_gate_result,
          updated_at: domain.updated_at,
        },
        gate_checks: gateChecks,
        summary,
        decision,
      };
    });

    return {
      generated_at: new Date().toISOString(),
      required_gate_types: [...this.requiredCutoverGateTypes],
      domains: checklistDomains,
      summary: {
        total_domains: checklistDomains.length,
        ready_count: checklistDomains.filter((item) => item.decision === 'READY')
          .length,
        review_count: checklistDomains.filter((item) => item.decision === 'REVIEW')
          .length,
        blocked_count: checklistDomains.filter((item) => item.decision === 'BLOCKED')
          .length,
      },
    };
  }

  async getCutoverReopenReadiness(params: { domainKey?: string }): Promise<any> {
    const checklist = await this.getCutoverGateChecklist(params);
    const checklistDomains = Array.isArray(checklist?.domains)
      ? checklist.domains
      : [];

    if (checklistDomains.length === 0) {
      return {
        generated_at: new Date().toISOString(),
        required_gate_types: [...this.requiredCutoverGateTypes],
        domains: [],
        summary: {
          total_domains: 0,
          reopen_required_count: 0,
          ready_count: 0,
          blocked_count: 0,
          not_required_count: 0,
        },
      };
    }

    const domainIds = checklistDomains
      .map((item) => item?.domain?.id)
      .filter(Boolean);
    const severityRank: Record<string, number> = {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      CRITICAL: 4,
    };

    const [{ data: issues, error: issuesError }, { data: stageRuns, error: stageRunsError }, { data: routingFlags, error: routingFlagsError }] =
      await Promise.all([
        this.supabase
          .from('v2_cutover_stage_issues')
          .select('id,domain_id,status,severity,occurred_at')
          .in('domain_id', domainIds)
          .neq('status', 'RESOLVED')
          .order('occurred_at', { ascending: false }),
        this.supabase
          .from('v2_cutover_stage_runs')
          .select(
            'id,domain_id,stage_no,run_key,status,transition_mode,started_at,finished_at,updated_at,created_at',
          )
          .in('domain_id', domainIds)
          .order('created_at', { ascending: false }),
        this.supabase
          .from('v2_cutover_routing_flags')
          .select(
            'id,domain_id,target,traffic_percent,enabled,priority,reason,updated_at,created_at',
          )
          .in('domain_id', domainIds)
          .eq('enabled', true)
          .order('priority', { ascending: true })
          .order('created_at', { ascending: false }),
      ]);

    if (issuesError) {
      throw new ApiException(
        'cutover reopen readiness issue 조회 실패',
        500,
        'V2_CUTOVER_REOPEN_ISSUES_FETCH_FAILED',
      );
    }
    if (stageRunsError) {
      throw new ApiException(
        'cutover reopen readiness stage run 조회 실패',
        500,
        'V2_CUTOVER_REOPEN_STAGE_RUNS_FETCH_FAILED',
      );
    }
    if (routingFlagsError) {
      throw new ApiException(
        'cutover reopen readiness routing flag 조회 실패',
        500,
        'V2_CUTOVER_REOPEN_ROUTING_FLAGS_FETCH_FAILED',
      );
    }

    const unresolvedIssuesByDomain = new Map<
      string,
      {
        count: number;
        highest_severity: string | null;
        latest_occurred_at: string | null;
      }
    >();
    for (const issue of issues || []) {
      const domainId = issue.domain_id as string;
      if (!domainId) {
        continue;
      }
      const current = unresolvedIssuesByDomain.get(domainId) || {
        count: 0,
        highest_severity: null,
        latest_occurred_at: null,
      };
      current.count += 1;
      if (!current.latest_occurred_at) {
        current.latest_occurred_at = issue.occurred_at || null;
      }
      const candidateSeverity = (issue.severity as string | null) || null;
      if (
        candidateSeverity &&
        (current.highest_severity === null ||
          severityRank[candidateSeverity] >
            (severityRank[current.highest_severity] || 0))
      ) {
        current.highest_severity = candidateSeverity;
      }
      unresolvedIssuesByDomain.set(domainId, current);
    }

    const latestStageRunByDomain = new Map<string, any>();
    const rollbackHistoryByDomain = new Set<string>();
    for (const run of stageRuns || []) {
      const domainId = run.domain_id as string;
      if (!domainId) {
        continue;
      }
      if (!latestStageRunByDomain.has(domainId)) {
        latestStageRunByDomain.set(domainId, run);
      }
      if (run.status === 'ROLLED_BACK') {
        rollbackHistoryByDomain.add(domainId);
      }
    }

    const activeRoutingByDomain = new Map<string, any>();
    for (const flag of routingFlags || []) {
      const domainId = flag.domain_id as string;
      if (!domainId) {
        continue;
      }
      if (!activeRoutingByDomain.has(domainId)) {
        activeRoutingByDomain.set(domainId, flag);
      }
    }

    const readinessDomains = checklistDomains.map((item) => {
      const domain = item.domain || {};
      const domainId = domain.id as string;
      const gateDecision = item.decision as 'READY' | 'REVIEW' | 'BLOCKED';
      const unresolvedInfo = unresolvedIssuesByDomain.get(domainId) || {
        count: 0,
        highest_severity: null,
        latest_occurred_at: null,
      };
      const latestStageRun = latestStageRunByDomain.get(domainId) || null;
      const activeRouting = activeRoutingByDomain.get(domainId) || null;

      const rollbackModeActive =
        activeRouting?.target === 'LEGACY' &&
        Number(activeRouting?.traffic_percent || 0) > 0;
      const latestStatus = (latestStageRun?.status as string | null) || null;
      const needsReopen =
        rollbackModeActive ||
        latestStatus === 'ROLLED_BACK' ||
        latestStatus === 'BLOCKED' ||
        latestStatus === 'CANCELED';
      const checks = {
        gate_ready: gateDecision === 'READY',
        unresolved_issues_cleared: unresolvedInfo.count === 0,
        latest_stage_run_completed: latestStatus === 'COMPLETED',
      };

      const blockers: string[] = [];
      if (needsReopen && !checks.gate_ready) {
        blockers.push('required gate checklist가 READY가 아님');
      }
      if (needsReopen && !checks.unresolved_issues_cleared) {
        blockers.push(`미해결 이슈 ${unresolvedInfo.count}건 존재`);
      }
      if (needsReopen && !checks.latest_stage_run_completed) {
        blockers.push('최신 stage run이 COMPLETED 상태가 아님');
      }

      const reopenDecision =
        !needsReopen ? 'NOT_REQUIRED' : blockers.length > 0 ? 'BLOCKED' : 'READY';

      return {
        domain: {
          id: domainId,
          domain_key: domain.domain_key || null,
          domain_name: domain.domain_name || null,
          status: domain.status || null,
          current_stage: domain.current_stage ?? null,
          owner_role_code: domain.owner_role_code || null,
          next_action: domain.next_action || null,
        },
        gate: {
          decision: gateDecision,
          summary: item.summary || null,
        },
        issues: {
          unresolved_count: unresolvedInfo.count,
          highest_severity: unresolvedInfo.highest_severity,
          latest_occurred_at: unresolvedInfo.latest_occurred_at,
        },
        latest_stage_run: latestStageRun
          ? {
              id: latestStageRun.id,
              stage_no: latestStageRun.stage_no,
              run_key: latestStageRun.run_key,
              status: latestStageRun.status,
              transition_mode: latestStageRun.transition_mode,
              started_at: latestStageRun.started_at,
              finished_at: latestStageRun.finished_at,
              updated_at: latestStageRun.updated_at || latestStageRun.created_at,
            }
          : null,
        active_routing_flag: activeRouting
          ? {
              id: activeRouting.id,
              target: activeRouting.target,
              traffic_percent: activeRouting.traffic_percent,
              priority: activeRouting.priority,
              reason: activeRouting.reason,
              updated_at: activeRouting.updated_at || activeRouting.created_at,
            }
          : null,
        rollback: {
          mode_active: rollbackModeActive,
          has_rollback_history: rollbackHistoryByDomain.has(domainId),
          needs_reopen: needsReopen,
        },
        approval_checks: checks,
        reopen_decision: reopenDecision,
        blockers,
      };
    });

    return {
      generated_at: new Date().toISOString(),
      required_gate_types:
        checklist.required_gate_types || [...this.requiredCutoverGateTypes],
      domains: readinessDomains,
      summary: {
        total_domains: readinessDomains.length,
        reopen_required_count: readinessDomains.filter(
          (item) => item.rollback.needs_reopen,
        ).length,
        ready_count: readinessDomains.filter(
          (item) => item.reopen_decision === 'READY',
        ).length,
        blocked_count: readinessDomains.filter(
          (item) => item.reopen_decision === 'BLOCKED',
        ).length,
        not_required_count: readinessDomains.filter(
          (item) => item.reopen_decision === 'NOT_REQUIRED',
        ).length,
      },
    };
  }

  async saveCutoverGateReport(input: {
    domainKey?: string;
    gateType?: string;
    gateKey?: string;
    gateResult?: string;
    measuredAt?: string | null;
    thresholdJson?: Record<string, unknown> | null;
    metricsJson?: Record<string, unknown> | null;
    detail?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<any> {
    const domainKey = this.normalizeRequiredText(
      input.domainKey,
      'domain_key가 필요합니다',
    );
    const gateType = this.normalizeRequiredText(
      input.gateType,
      'gate_type이 필요합니다',
    );
    const gateKey = this.normalizeRequiredText(input.gateKey, 'gate_key가 필요합니다');
    const gateResult = this.normalizeRequiredText(
      input.gateResult,
      'gate_result가 필요합니다',
    );
    const domain = await this.requireCutoverDomain(domainKey);

    const measuredAt =
      this.normalizeOptionalIsoDateTime(input.measuredAt) || new Date().toISOString();

    const { data, error } = await this.supabase
      .from('v2_cutover_gate_reports')
      .insert({
        domain_id: domain.id,
        gate_type: gateType,
        gate_key: gateKey,
        gate_result: gateResult,
        measured_at: measuredAt,
        threshold_json: this.normalizeOptionalJsonObject(input.thresholdJson) || {},
        metrics_json: this.normalizeOptionalJsonObject(input.metricsJson) || {},
        detail: this.normalizeOptionalText(input.detail),
        metadata: this.normalizeOptionalJsonObject(input.metadata) || {},
      })
      .select(
        '*, domain:v2_cutover_domains(domain_key,domain_name,status,current_stage)',
      )
      .maybeSingle();

    if (error || !data) {
      throw new ApiException(
        'cutover gate report 저장 실패',
        500,
        'V2_CUTOVER_GATE_REPORT_SAVE_FAILED',
      );
    }

    await this.supabase
      .from('v2_cutover_domains')
      .update({
        last_gate_result: gateResult,
      })
      .eq('id', domain.id);

    return data;
  }

  async listCutoverBatches(params: {
    limit?: string;
    domainKey?: string;
    status?: string;
    runType?: string;
  }): Promise<any> {
    const limit = this.normalizeLimit(params.limit);
    let query = this.supabase
      .from('v2_cutover_batches')
      .select(
        '*, domain:v2_cutover_domains(domain_key,domain_name,status,current_stage)',
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    const status = this.normalizeOptionalText(params.status);
    if (status) {
      query = query.eq('status', status);
    }
    const runType = this.normalizeOptionalText(params.runType);
    if (runType) {
      query = query.eq('run_type', runType);
    }
    const domainKey = this.normalizeOptionalText(params.domainKey);
    if (domainKey) {
      const domain = await this.requireCutoverDomain(domainKey);
      query = query.eq('domain_id', domain.id);
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiException(
        'cutover batch 조회 실패',
        500,
        'V2_CUTOVER_BATCHES_FETCH_FAILED',
      );
    }

    return {
      items: data || [],
      limit,
    };
  }

  async saveCutoverBatch(input: {
    domainKey?: string;
    batchKey?: string;
    runType?: string;
    status?: string;
    idempotencyKey?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
    sourceSnapshot?: Record<string, unknown> | null;
    resultSummary?: Record<string, unknown> | null;
    errorMessage?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<any> {
    const domainKey = this.normalizeRequiredText(
      input.domainKey,
      'domain_key가 필요합니다',
    );
    const batchKey = this.normalizeRequiredText(input.batchKey, 'batch_key가 필요합니다');
    const runType = this.normalizeRequiredText(input.runType, 'run_type이 필요합니다');
    const domain = await this.requireCutoverDomain(domainKey);

    const status = this.normalizeOptionalText(input.status) || 'PENDING';
    const basePayload = {
      domain_id: domain.id,
      batch_key: batchKey,
      run_type: runType,
      status,
      idempotency_key: this.normalizeOptionalText(input.idempotencyKey),
      started_at: this.normalizeOptionalIsoDateTime(input.startedAt),
      finished_at: this.normalizeOptionalIsoDateTime(input.finishedAt),
      source_snapshot: this.normalizeOptionalJsonObject(input.sourceSnapshot) || {},
      result_summary: this.normalizeOptionalJsonObject(input.resultSummary) || {},
      error_message: this.normalizeOptionalText(input.errorMessage),
      metadata: this.normalizeOptionalJsonObject(input.metadata) || {},
    };

    const { data: existing, error: existingError } = await this.supabase
      .from('v2_cutover_batches')
      .select('id')
      .eq('batch_key', batchKey)
      .maybeSingle();

    if (existingError) {
      throw new ApiException(
        'cutover batch 기존 데이터 조회 실패',
        500,
        'V2_CUTOVER_BATCH_FETCH_FAILED',
      );
    }

    if (existing?.id) {
      const { data, error } = await this.supabase
        .from('v2_cutover_batches')
        .update(basePayload)
        .eq('id', existing.id)
        .select(
          '*, domain:v2_cutover_domains(domain_key,domain_name,status,current_stage)',
        )
        .maybeSingle();

      if (error || !data) {
        throw new ApiException(
          'cutover batch 업데이트 실패',
          500,
          'V2_CUTOVER_BATCH_UPDATE_FAILED',
        );
      }
      return data;
    }

    const { data, error } = await this.supabase
      .from('v2_cutover_batches')
      .insert(basePayload)
      .select(
        '*, domain:v2_cutover_domains(domain_key,domain_name,status,current_stage)',
      )
      .maybeSingle();

    if (error || !data) {
      throw new ApiException(
        'cutover batch 생성 실패',
        500,
        'V2_CUTOVER_BATCH_CREATE_FAILED',
      );
    }

    return data;
  }

  async listCutoverRoutingFlags(params: {
    limit?: string;
    domainKey?: string;
    channel?: string;
    enabled?: string;
  }): Promise<any> {
    const limit = this.normalizeLimit(params.limit);
    let query = this.supabase
      .from('v2_cutover_routing_flags')
      .select(
        '*, domain:v2_cutover_domains(domain_key,domain_name,status,current_stage)',
      )
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(limit);

    const domainKey = this.normalizeOptionalText(params.domainKey);
    if (domainKey) {
      const domain = await this.requireCutoverDomain(domainKey);
      query = query.eq('domain_id', domain.id);
    }

    const channel = this.normalizeOptionalText(params.channel);
    if (channel) {
      query = query.eq('channel', channel);
    }

    const enabled = this.normalizeOptionalText(params.enabled);
    if (enabled) {
      query = query.eq('enabled', this.parseBoolean(enabled));
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiException(
        'cutover routing flag 조회 실패',
        500,
        'V2_CUTOVER_ROUTING_FLAGS_FETCH_FAILED',
      );
    }

    return {
      items: data || [],
      limit,
    };
  }

  async saveCutoverRoutingFlag(input: {
    id?: string | null;
    domainKey?: string;
    channel?: string | null;
    campaignId?: string | null;
    target?: string;
    trafficPercent?: number;
    enabled?: boolean;
    priority?: number;
    reason?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<any> {
    const domainKey = this.normalizeRequiredText(
      input.domainKey,
      'domain_key가 필요합니다',
    );
    const domain = await this.requireCutoverDomain(domainKey);

    const trafficPercent =
      typeof input.trafficPercent === 'number'
        ? Math.max(0, Math.min(100, Math.trunc(input.trafficPercent)))
        : 0;
    const priority =
      typeof input.priority === 'number' ? Math.max(0, Math.trunc(input.priority)) : 100;

    const payload = {
      domain_id: domain.id,
      channel: this.normalizeOptionalText(input.channel),
      campaign_id: this.normalizeOptionalUuid(input.campaignId),
      target: this.normalizeOptionalText(input.target) || 'LEGACY',
      traffic_percent: trafficPercent,
      enabled: input.enabled ?? true,
      priority,
      reason: this.normalizeOptionalText(input.reason),
      metadata: this.normalizeOptionalJsonObject(input.metadata) || {},
    };

    const recordId = this.normalizeOptionalUuid(input.id);
    if (recordId) {
      const { data, error } = await this.supabase
        .from('v2_cutover_routing_flags')
        .update(payload)
        .eq('id', recordId)
        .select(
          '*, domain:v2_cutover_domains(domain_key,domain_name,status,current_stage)',
        )
        .maybeSingle();

      if (error || !data) {
        throw new ApiException(
          'cutover routing flag 업데이트 실패',
          500,
          'V2_CUTOVER_ROUTING_FLAG_UPDATE_FAILED',
        );
      }
      return data;
    }

    const { data, error } = await this.supabase
      .from('v2_cutover_routing_flags')
      .insert(payload)
      .select(
        '*, domain:v2_cutover_domains(domain_key,domain_name,status,current_stage)',
      )
      .maybeSingle();

    if (error || !data) {
      throw new ApiException(
        'cutover routing flag 생성 실패',
        500,
        'V2_CUTOVER_ROUTING_FLAG_CREATE_FAILED',
      );
    }

    return data;
  }

  async listCutoverStageRuns(params: {
    limit?: string;
    domainKey?: string;
    stageNo?: string;
    status?: string;
  }): Promise<any> {
    const limit = this.normalizeLimit(params.limit);
    let query = this.supabase
      .from('v2_cutover_stage_runs')
      .select(
        '*, domain:v2_cutover_domains(domain_key,domain_name,status,current_stage)',
      )
      .order('created_at', { ascending: false })
      .limit(limit);

    const domainKey = this.normalizeOptionalText(params.domainKey);
    if (domainKey) {
      const domain = await this.requireCutoverDomain(domainKey);
      query = query.eq('domain_id', domain.id);
    }

    const stageNo = this.normalizeOptionalText(params.stageNo);
    if (stageNo) {
      query = query.eq('stage_no', this.parseRequiredStageNo(stageNo));
    }

    const status = this.normalizeOptionalText(params.status);
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiException(
        'cutover stage run 조회 실패',
        500,
        'V2_CUTOVER_STAGE_RUNS_FETCH_FAILED',
      );
    }

    return {
      items: data || [],
      limit,
    };
  }

  async saveCutoverStageRun(input: {
    domainKey?: string;
    stageNo?: string | number;
    runKey?: string;
    status?: string;
    transitionMode?: string;
    startedAt?: string | null;
    finishedAt?: string | null;
    limitedTargets?: unknown[] | null;
    summary?: Record<string, unknown> | null;
    approvalNote?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<any> {
    const domainKey = this.normalizeRequiredText(
      input.domainKey,
      'domain_key가 필요합니다',
    );
    const domain = await this.requireCutoverDomain(domainKey);
    const stageNo = this.parseRequiredStageNo(input.stageNo);
    const runKey = this.normalizeRequiredText(input.runKey, 'run_key가 필요합니다');
    const status = this.normalizeOptionalText(input.status) || 'PLANNED';
    const transitionMode =
      this.normalizeOptionalText(input.transitionMode) || 'LIMITED';

    const limitedTargets =
      input.limitedTargets === undefined || input.limitedTargets === null
        ? []
        : Array.isArray(input.limitedTargets)
        ? input.limitedTargets
        : null;
    if (limitedTargets === null) {
      throw new ApiException(
        'limited_targets는 배열이어야 합니다',
        400,
        'V2_CUTOVER_STAGE_RUN_TARGETS_INVALID',
      );
    }

    const payload = {
      domain_id: domain.id,
      stage_no: stageNo,
      run_key: runKey,
      status,
      transition_mode: transitionMode,
      started_at: this.normalizeOptionalIsoDateTime(input.startedAt),
      finished_at: this.normalizeOptionalIsoDateTime(input.finishedAt),
      limited_targets: limitedTargets,
      summary: this.normalizeOptionalJsonObject(input.summary) || {},
      approval_note: this.normalizeOptionalText(input.approvalNote),
      metadata: this.normalizeOptionalJsonObject(input.metadata) || {},
    };

    const { data: existing, error: existingError } = await this.supabase
      .from('v2_cutover_stage_runs')
      .select('id')
      .eq('run_key', runKey)
      .maybeSingle();

    if (existingError) {
      throw new ApiException(
        'cutover stage run 기존 데이터 조회 실패',
        500,
        'V2_CUTOVER_STAGE_RUN_FETCH_FAILED',
      );
    }

    if (existing?.id) {
      const { data, error } = await this.supabase
        .from('v2_cutover_stage_runs')
        .update(payload)
        .eq('id', existing.id)
        .select(
          '*, domain:v2_cutover_domains(domain_key,domain_name,status,current_stage)',
        )
        .maybeSingle();

      if (error || !data) {
        throw new ApiException(
          'cutover stage run 업데이트 실패',
          500,
          'V2_CUTOVER_STAGE_RUN_UPDATE_FAILED',
        );
      }
      return data;
    }

    const { data, error } = await this.supabase
      .from('v2_cutover_stage_runs')
      .insert(payload)
      .select(
        '*, domain:v2_cutover_domains(domain_key,domain_name,status,current_stage)',
      )
      .maybeSingle();

    if (error || !data) {
      throw new ApiException(
        'cutover stage run 생성 실패',
        500,
        'V2_CUTOVER_STAGE_RUN_CREATE_FAILED',
      );
    }

    return data;
  }

  async listCutoverStageIssues(params: {
    limit?: string;
    domainKey?: string;
    stageNo?: string;
    status?: string;
    severity?: string;
  }): Promise<any> {
    const limit = this.normalizeLimit(params.limit);
    let query = this.supabase
      .from('v2_cutover_stage_issues')
      .select(
        '*, domain:v2_cutover_domains(domain_key,domain_name,status,current_stage), stage_run:v2_cutover_stage_runs(id,run_key,status,stage_no)',
      )
      .order('occurred_at', { ascending: false })
      .limit(limit);

    const domainKey = this.normalizeOptionalText(params.domainKey);
    if (domainKey) {
      const domain = await this.requireCutoverDomain(domainKey);
      query = query.eq('domain_id', domain.id);
    }

    const stageNo = this.normalizeOptionalText(params.stageNo);
    if (stageNo) {
      query = query.eq('stage_no', this.parseRequiredStageNo(stageNo));
    }

    const status = this.normalizeOptionalText(params.status);
    if (status) {
      query = query.eq('status', status);
    }

    const severity = this.normalizeOptionalText(params.severity);
    if (severity) {
      query = query.eq('severity', severity);
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiException(
        'cutover stage issue 조회 실패',
        500,
        'V2_CUTOVER_STAGE_ISSUES_FETCH_FAILED',
      );
    }

    return {
      items: data || [],
      limit,
    };
  }

  async saveCutoverStageIssue(input: {
    id?: string | null;
    stageRunId?: string | null;
    domainKey?: string;
    stageNo?: string | number;
    status?: string;
    severity?: string;
    issueType?: string;
    title?: string;
    detail?: string | null;
    recoveryAction?: string | null;
    ownerRoleCode?: string | null;
    occurredAt?: string | null;
    resolvedAt?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Promise<any> {
    const domainKey = this.normalizeRequiredText(
      input.domainKey,
      'domain_key가 필요합니다',
    );
    const domain = await this.requireCutoverDomain(domainKey);
    const stageNo = this.parseRequiredStageNo(input.stageNo);
    const stageRunId = this.normalizeOptionalUuid(input.stageRunId);
    const issueId = this.normalizeOptionalUuid(input.id);

    if (stageRunId) {
      const { data: stageRun, error: stageRunError } = await this.supabase
        .from('v2_cutover_stage_runs')
        .select('id,domain_id,stage_no')
        .eq('id', stageRunId)
        .maybeSingle();

      if (stageRunError) {
        throw new ApiException(
          'stage run 조회 실패',
          500,
          'V2_CUTOVER_STAGE_RUN_REF_FETCH_FAILED',
        );
      }
      if (!stageRun) {
        throw new ApiException(
          '존재하지 않는 stage_run_id 입니다',
          404,
          'V2_CUTOVER_STAGE_RUN_NOT_FOUND',
        );
      }
      if (stageRun.domain_id !== domain.id || Number(stageRun.stage_no) !== stageNo) {
        throw new ApiException(
          'stage_run_id의 domain/stage 정보가 일치하지 않습니다',
          400,
          'V2_CUTOVER_STAGE_RUN_MISMATCH',
        );
      }
    }

    const payload = {
      stage_run_id: stageRunId,
      domain_id: domain.id,
      stage_no: stageNo,
      status: this.normalizeOptionalText(input.status) || 'OPEN',
      severity: this.normalizeOptionalText(input.severity) || 'MEDIUM',
      issue_type: this.normalizeOptionalText(input.issueType) || 'INCIDENT',
      title: this.normalizeRequiredText(input.title, 'title이 필요합니다'),
      detail: this.normalizeOptionalText(input.detail),
      recovery_action: this.normalizeOptionalText(input.recoveryAction),
      owner_role_code: this.normalizeOptionalText(input.ownerRoleCode),
      occurred_at:
        this.normalizeOptionalIsoDateTime(input.occurredAt) || new Date().toISOString(),
      resolved_at: this.normalizeOptionalIsoDateTime(input.resolvedAt),
      metadata: this.normalizeOptionalJsonObject(input.metadata) || {},
    };

    if (issueId) {
      const { data, error } = await this.supabase
        .from('v2_cutover_stage_issues')
        .update(payload)
        .eq('id', issueId)
        .select(
          '*, domain:v2_cutover_domains(domain_key,domain_name,status,current_stage), stage_run:v2_cutover_stage_runs(id,run_key,status,stage_no)',
        )
        .maybeSingle();

      if (error || !data) {
        throw new ApiException(
          'cutover stage issue 업데이트 실패',
          500,
          'V2_CUTOVER_STAGE_ISSUE_UPDATE_FAILED',
        );
      }
      return data;
    }

    const { data, error } = await this.supabase
      .from('v2_cutover_stage_issues')
      .insert(payload)
      .select(
        '*, domain:v2_cutover_domains(domain_key,domain_name,status,current_stage), stage_run:v2_cutover_stage_runs(id,run_key,status,stage_no)',
      )
      .maybeSingle();

    if (error || !data) {
      throw new ApiException(
        'cutover stage issue 생성 실패',
        500,
        'V2_CUTOVER_STAGE_ISSUE_CREATE_FAILED',
      );
    }

    return data;
  }

  async listRoles(): Promise<any[]> {
    const { data: roles, error: rolesError } = await this.supabase
      .from('v2_admin_roles')
      .select('*')
      .eq('is_active', true)
      .order('code', { ascending: true });

    if (rolesError) {
      throw new ApiException(
        'admin role 조회 실패',
        500,
        'V2_ADMIN_ROLES_FETCH_FAILED',
      );
    }

    const { data: rolePermissions, error: rolePermissionsError } =
      await this.supabase
        .from('v2_admin_role_permissions')
        .select('*')
        .eq('is_active', true);

    if (rolePermissionsError) {
      throw new ApiException(
        'admin role permission 조회 실패',
        500,
        'V2_ADMIN_ROLE_PERMISSIONS_FETCH_FAILED',
      );
    }

    const permissionByRoleId = new Map<string, string[]>();
    for (const row of rolePermissions || []) {
      const roleId = row.role_id as string;
      const current = permissionByRoleId.get(roleId) || [];
      current.push(row.permission_code as string);
      permissionByRoleId.set(roleId, current);
    }

    return (roles || []).map((role) => ({
      ...role,
      permissions: (permissionByRoleId.get(role.id as string) || []).sort(),
    }));
  }

  async getMyRbac(userId: string): Promise<any> {
    const { data: userRoles, error: userRolesError } = await this.supabase
      .from('v2_admin_user_roles')
      .select('*, role:v2_admin_roles(*)')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
      .order('assigned_at', { ascending: false });

    if (userRolesError) {
      throw new ApiException(
        '내 role 조회 실패',
        500,
        'V2_ADMIN_USER_ROLES_FETCH_FAILED',
      );
    }

    const activeRoles = (userRoles || []).filter((row) => row.role?.is_active);
    const roleIds = Array.from(
      new Set(activeRoles.map((row) => row.role_id as string).filter(Boolean)),
    );

    let rolePermissions: any[] = [];
    if (roleIds.length > 0) {
      const { data, error } = await this.supabase
        .from('v2_admin_role_permissions')
        .select('*')
        .in('role_id', roleIds)
        .eq('is_active', true);

      if (error) {
        throw new ApiException(
          '내 permission 조회 실패',
          500,
          'V2_ADMIN_MY_PERMISSIONS_FETCH_FAILED',
        );
      }
      rolePermissions = data || [];
    }

    const permissions = Array.from(
      new Set(
        rolePermissions
          .map((row) => row.permission_code as string)
          .filter(Boolean),
      ),
    ).sort();

    return {
      user_id: userId,
      roles: activeRoles.map((row) => ({
        id: row.id,
        role_id: row.role_id,
        role_code: row.role?.code || null,
        role_name: row.role?.name || null,
        scope_type: row.scope_type,
        scope_id: row.scope_id,
        status: row.status,
        assigned_at: row.assigned_at,
        expires_at: row.expires_at,
      })),
      permissions,
    };
  }

  async listActionLogs(params: {
    limit?: string;
    status?: string;
    domain?: string;
  }): Promise<any> {
    const limit = this.normalizeLimit(params.limit);
    let query = this.supabase
      .from('v2_admin_action_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    const status = this.normalizeOptionalText(params.status);
    if (status) {
      query = query.eq('action_status', status);
    }
    const domain = this.normalizeOptionalText(params.domain);
    if (domain) {
      query = query.eq('domain', domain);
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiException(
        'action log 조회 실패',
        500,
        'V2_ADMIN_ACTION_LOGS_FETCH_FAILED',
      );
    }
    return {
      items: data || [],
      limit,
    };
  }

  async listApprovals(params: {
    limit?: string;
    status?: string;
  }): Promise<any> {
    const limit = this.normalizeLimit(params.limit);
    let query = this.supabase
      .from('v2_admin_approval_requests')
      .select('*')
      .order('requested_at', { ascending: false })
      .limit(limit);

    const status = this.normalizeOptionalText(params.status);
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiException(
        'approval request 조회 실패',
        500,
        'V2_ADMIN_APPROVALS_FETCH_FAILED',
      );
    }
    return {
      items: data || [],
      limit,
    };
  }

  async listOrderQueue(params: {
    limit?: string;
    orderStatus?: string;
  }): Promise<any> {
    const limit = this.normalizeLimit(params.limit);
    let query = this.supabase
      .from('v2_admin_order_queue_view')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    const orderStatus = this.normalizeOptionalText(params.orderStatus);
    if (orderStatus) {
      query = query.eq('order_status', orderStatus);
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiException(
        'order queue 조회 실패',
        500,
        'V2_ADMIN_ORDER_QUEUE_FETCH_FAILED',
      );
    }

    return {
      items: data || [],
      limit,
    };
  }

  async bulkOrderQueueAction(input: {
    mode?: string;
    actionKey?: string;
    orderIds?: string[];
    reason?: string | null;
    requestId?: string | null;
    previewLimit?: string | number;
    metadata?: Record<string, unknown> | null;
    actor?: {
      id?: string | null;
      email?: string | null;
      isLocalBypass?: boolean;
    };
  }): Promise<any> {
    const mode = this.normalizeBulkActionMode(input.mode);
    const actionKey = this.normalizeBulkActionKey(input.actionKey);
    const orderIds = this.normalizeBulkOrderIds(input.orderIds);
    const previewLimit = this.normalizeBulkPreviewLimit(input.previewLimit);
    const reason = this.normalizeOptionalText(input.reason);
    const requestId = this.normalizeOptionalText(input.requestId);
    const metadata = this.normalizeOptionalJsonObject(input.metadata) || {};
    const actor = this.normalizeBulkActor(input.actor);
    const now = new Date().toISOString();

    const ordersById = await this.fetchBulkTargetOrders(orderIds);
    const candidatesByOrderId = await this.resolveBulkCandidatesByOrder({
      actionKey,
      orderIds,
      previewLimit,
    });

    const rows = orderIds.map((orderId) => {
      const order = ordersById.get(orderId) || null;
      const candidates = candidatesByOrderId.get(orderId) || [];
      return {
        order_id: orderId,
        order_no: order?.order_no || null,
        exists: Boolean(order),
        statuses: order
          ? {
              order_status: order.order_status,
              payment_status: order.payment_status,
              fulfillment_status: order.fulfillment_status,
            }
          : null,
        candidate_count: candidates.length,
        candidates: candidates.slice(0, previewLimit),
      };
    });

    const summary = {
      requested_order_count: orderIds.length,
      found_order_count: rows.filter((row) => row.exists).length,
      missing_order_count: rows.filter((row) => !row.exists).length,
      candidate_count: rows.reduce(
        (sum, row) => sum + Number(row.candidate_count || 0),
        0,
      ),
    };

    if (mode === 'DRY_RUN') {
      return {
        mode,
        action_key: actionKey,
        requested_at: now,
        summary,
        rows,
      };
    }

    const executableCandidates = rows
      .filter((row) => row.exists)
      .flatMap((row) =>
        (row.candidates || []).map((candidate: any) => ({
          ...candidate,
          order_id: row.order_id,
          order_no: row.order_no,
        })),
      );

    if (executableCandidates.length === 0) {
      return {
        mode,
        action_key: actionKey,
        requested_at: now,
        summary,
        execute: {
          queued_count: 0,
          action_log_ids: [],
          note: '실행 가능한 대상이 없어 액션 로그를 생성하지 않았습니다.',
        },
      };
    }

    const requiresApproval = actionKey === 'FULFILLMENT_ENTITLEMENT_REVOKE';
    const actionLogRows = executableCandidates.map((candidate) => ({
      action_key: actionKey,
      domain: 'ORDER',
      resource_type: candidate.resource_type,
      resource_id: candidate.resource_id,
      actor_id: actor.id,
      actor_email_snapshot: actor.email,
      request_id: requestId,
      action_status: 'PENDING',
      requires_approval: requiresApproval,
      input_payload: {
        mode,
        source: 'ORDER_QUEUE_BULK_ACTION_SKELETON',
        action_key: actionKey,
        order_id: candidate.order_id,
        order_no: candidate.order_no,
        resource_type: candidate.resource_type,
        resource_id: candidate.resource_id,
        current_status: candidate.current_status,
        reason: reason || null,
      },
      precheck_result: {
        dry_run_validated: true,
        candidate_resolved: true,
      },
      permission_result: {
        admin_checked: true,
        local_bypass: actor.isLocalBypass,
      },
      transition_result: {
        transition_key: this.resolveBulkTransitionKey(actionKey),
        from_state: candidate.current_status,
      },
      execution_result: {
        queued_only: true,
        skeleton: true,
        reason:
          '실제 상태 전이 연결 전 단계입니다. 후속 작업에서 도메인 executor와 연동됩니다.',
      },
      metadata: {
        ...metadata,
        bulk_reason: reason || null,
        bulk_requested_at: now,
      },
    }));

    const { data: inserted, error: insertError } = await this.supabase
      .from('v2_admin_action_logs')
      .insert(actionLogRows)
      .select('id, resource_type, resource_id, action_status, requires_approval, created_at');

    if (insertError) {
      throw new ApiException(
        'bulk action log 생성 실패',
        500,
        'V2_ADMIN_BULK_ACTION_LOG_CREATE_FAILED',
      );
    }

    return {
      mode,
      action_key: actionKey,
      requested_at: now,
      summary,
      rows,
      execute: {
        queued_count: inserted?.length || 0,
        action_log_ids: (inserted || []).map((row: any) => row.id).filter(Boolean),
        logs: inserted || [],
        note: '현재 execute는 action log enqueue 스켈레톤 단계입니다.',
      },
    };
  }

  async getOrderDetail(orderId: string): Promise<any> {
    const normalizedOrderId = this.normalizeRequiredText(
      orderId,
      'order_id가 필요합니다',
    );

    const { data: order, error: orderError } = await this.supabase
      .from('v2_orders')
      .select('*')
      .eq('id', normalizedOrderId)
      .maybeSingle();

    if (orderError) {
      throw new ApiException(
        '주문 상세 조회 실패',
        500,
        'V2_ADMIN_ORDER_DETAIL_FETCH_FAILED',
      );
    }
    if (!order) {
      throw new ApiException(
        '주문을 찾을 수 없습니다',
        404,
        'V2_ADMIN_ORDER_NOT_FOUND',
      );
    }

    const [
      queueResult,
      itemsResult,
      adjustmentsResult,
      paymentsResult,
      fulfillmentQueueResult,
      actionLogsResult,
    ] = await Promise.all([
      this.supabase
        .from('v2_admin_order_queue_view')
        .select('*')
        .eq('order_id', normalizedOrderId)
        .maybeSingle(),
      this.supabase
        .from('v2_order_items')
        .select('*')
        .eq('order_id', normalizedOrderId)
        .order('created_at', { ascending: true }),
      this.supabase
        .from('v2_order_adjustments')
        .select('*')
        .eq('order_id', normalizedOrderId)
        .order('created_at', { ascending: true }),
      this.supabase
        .from('v2_payments')
        .select('*')
        .eq('order_id', normalizedOrderId)
        .order('created_at', { ascending: true }),
      this.supabase
        .from('v2_admin_fulfillment_queue_view')
        .select('*')
        .eq('order_id', normalizedOrderId)
        .order('updated_at', { ascending: false }),
      this.supabase
        .from('v2_admin_action_logs')
        .select('*')
        .eq('resource_type', 'ORDER')
        .eq('resource_id', normalizedOrderId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (queueResult.error) {
      throw new ApiException(
        'order queue 상세 조회 실패',
        500,
        'V2_ADMIN_ORDER_QUEUE_DETAIL_FETCH_FAILED',
      );
    }
    if (itemsResult.error) {
      throw new ApiException(
        'order item 상세 조회 실패',
        500,
        'V2_ADMIN_ORDER_ITEMS_FETCH_FAILED',
      );
    }
    if (adjustmentsResult.error) {
      throw new ApiException(
        'order adjustment 상세 조회 실패',
        500,
        'V2_ADMIN_ORDER_ADJUSTMENTS_FETCH_FAILED',
      );
    }
    if (paymentsResult.error) {
      throw new ApiException(
        'order payment 상세 조회 실패',
        500,
        'V2_ADMIN_ORDER_PAYMENTS_FETCH_FAILED',
      );
    }
    if (fulfillmentQueueResult.error) {
      throw new ApiException(
        'fulfillment queue 상세 조회 실패',
        500,
        'V2_ADMIN_FULFILLMENT_DETAIL_FETCH_FAILED',
      );
    }
    if (actionLogsResult.error) {
      throw new ApiException(
        'action log 상세 조회 실패',
        500,
        'V2_ADMIN_ACTION_LOG_DETAIL_FETCH_FAILED',
      );
    }

    const actionLogs = actionLogsResult.data || [];
    const actionLogIds = actionLogs
      .map((log: any) => log.id as string)
      .filter(Boolean);

    let approvals: any[] = [];
    if (actionLogIds.length > 0) {
      const { data: approvalRows, error: approvalsError } = await this.supabase
        .from('v2_admin_approval_requests')
        .select('*')
        .in('action_log_id', actionLogIds)
        .order('requested_at', { ascending: false });

      if (approvalsError) {
        throw new ApiException(
          'approval 상세 조회 실패',
          500,
          'V2_ADMIN_APPROVAL_DETAIL_FETCH_FAILED',
        );
      }
      approvals = approvalRows || [];
    }

    return {
      order,
      queue_row: queueResult.data || null,
      items: itemsResult.data || [],
      adjustments: adjustmentsResult.data || [],
      payments: paymentsResult.data || [],
      fulfillment_queue: fulfillmentQueueResult.data || [],
      action_logs: actionLogs,
      approvals,
    };
  }

  async listFulfillmentQueue(params: {
    limit?: string;
    kind?: string;
    status?: string;
  }): Promise<any> {
    const limit = this.normalizeLimit(params.limit);
    let query = this.supabase
      .from('v2_admin_fulfillment_queue_view')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);

    const kind = this.normalizeOptionalText(params.kind);
    if (kind) {
      query = query.eq('fulfillment_kind', kind);
    }

    const status = this.normalizeOptionalText(params.status);
    if (status) {
      query = query.eq('fulfillment_group_status', status);
    }

    const { data, error } = await query;
    if (error) {
      throw new ApiException(
        'fulfillment queue 조회 실패',
        500,
        'V2_ADMIN_FULFILLMENT_QUEUE_FETCH_FAILED',
      );
    }

    return {
      items: data || [],
      limit,
    };
  }

  async listInventoryHealth(params: {
    limit?: string;
    onlyMismatches?: string;
    onlyLowStock?: string;
  }): Promise<any> {
    const limit = this.normalizeLimit(params.limit);
    const onlyMismatches = this.parseBoolean(params.onlyMismatches);
    const onlyLowStock = this.parseBoolean(params.onlyLowStock);

    const { data, error } = await this.supabase
      .from('v2_admin_inventory_health_view')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      throw new ApiException(
        'inventory health 조회 실패',
        500,
        'V2_ADMIN_INVENTORY_HEALTH_FETCH_FAILED',
      );
    }

    let items = data || [];
    if (onlyMismatches) {
      items = items.filter((row: any) => Number(row.reservation_delta || 0) !== 0);
    }
    if (onlyLowStock) {
      items = items.filter(
        (row: any) =>
          Number(row.available_quantity || 0) <= Number(row.safety_stock_quantity || 0),
      );
    }

    return {
      items: items.slice(0, limit),
      limit,
      summary: {
        total: items.length,
        mismatch_count: items.filter(
          (row: any) => Number(row.reservation_delta || 0) !== 0,
        ).length,
        low_stock_count: items.filter(
          (row: any) =>
            Number(row.available_quantity || 0) <=
            Number(row.safety_stock_quantity || 0),
        ).length,
      },
    };
  }

  private async requireCutoverDomain(domainKey: string): Promise<any> {
    const normalizedDomainKey = domainKey.trim().toUpperCase();
    const { data, error } = await this.supabase
      .from('v2_cutover_domains')
      .select('*')
      .eq('domain_key', normalizedDomainKey)
      .maybeSingle();

    if (error) {
      throw new ApiException(
        'cutover domain 조회 실패',
        500,
        'V2_CUTOVER_DOMAIN_FETCH_FAILED',
      );
    }

    if (!data) {
      throw new ApiException(
        `존재하지 않는 domain_key 입니다: ${normalizedDomainKey}`,
        404,
        'V2_CUTOVER_DOMAIN_NOT_FOUND',
      );
    }

    return data;
  }

  private normalizeRequiredText(
    value: string | null | undefined,
    message: string,
  ): string {
    const normalized = this.normalizeOptionalText(value);
    if (!normalized) {
      throw new ApiException(message, 400, 'V2_CUTOVER_REQUIRED_FIELD');
    }
    return normalized;
  }

  private normalizeOptionalUuid(value?: string | null): string | null {
    const normalized = this.normalizeOptionalText(value);
    if (!normalized) {
      return null;
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(normalized)) {
      throw new ApiException(
        'UUID 형식이 올바르지 않습니다',
        400,
        'V2_CUTOVER_UUID_INVALID',
      );
    }
    return normalized;
  }

  private normalizeOptionalIsoDateTime(value?: string | null): string | null {
    const normalized = this.normalizeOptionalText(value);
    if (!normalized) {
      return null;
    }
    const parsed = Date.parse(normalized);
    if (Number.isNaN(parsed)) {
      throw new ApiException(
        'ISO datetime 형식이 올바르지 않습니다',
        400,
        'V2_CUTOVER_DATETIME_INVALID',
      );
    }
    return new Date(parsed).toISOString();
  }

  private normalizeOptionalJsonObject(
    value?: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new ApiException(
        'JSON object 형식이 올바르지 않습니다',
        400,
        'V2_CUTOVER_JSON_INVALID',
      );
    }
    return value;
  }

  private parseRequiredStageNo(value: string | number | null | undefined): number {
    const raw =
      typeof value === 'number'
        ? String(value)
        : this.normalizeOptionalText(value as string | null);
    if (!raw) {
      throw new ApiException(
        'stage_no가 필요합니다',
        400,
        'V2_CUTOVER_STAGE_NO_REQUIRED',
      );
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 8) {
      throw new ApiException(
        'stage_no는 0~8 범위의 정수여야 합니다',
        400,
        'V2_CUTOVER_STAGE_NO_INVALID',
      );
    }
    return parsed;
  }

  private normalizeLimit(raw?: string): number {
    if (!raw) {
      return 20;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      return 20;
    }
    return Math.max(1, Math.min(100, parsed));
  }

  private normalizeBulkActionMode(raw?: string): 'DRY_RUN' | 'EXECUTE' {
    const normalized = this.normalizeOptionalText(raw)?.toUpperCase();
    if (normalized === 'EXECUTE') {
      return 'EXECUTE';
    }
    return 'DRY_RUN';
  }

  private normalizeBulkActionKey(raw?: string): string {
    const normalized = this.normalizeRequiredText(
      raw,
      'action_key가 필요합니다',
    ).toUpperCase();
    const supported = new Set([
      'FULFILLMENT_SHIPMENT_DISPATCH',
      'FULFILLMENT_ENTITLEMENT_REISSUE',
      'FULFILLMENT_ENTITLEMENT_REVOKE',
    ]);
    if (!supported.has(normalized)) {
      throw new ApiException(
        `지원하지 않는 bulk action_key 입니다: ${normalized}`,
        400,
        'V2_ADMIN_BULK_ACTION_UNSUPPORTED',
      );
    }
    return normalized;
  }

  private normalizeBulkOrderIds(raw?: string[]): string[] {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new ApiException(
        'order_ids 배열이 필요합니다',
        400,
        'V2_ADMIN_BULK_ORDER_IDS_REQUIRED',
      );
    }

    const deduped = Array.from(
      new Set(
        raw
          .map((value) => this.normalizeOptionalText(value))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    if (deduped.length === 0) {
      throw new ApiException(
        '유효한 order_id가 없습니다',
        400,
        'V2_ADMIN_BULK_ORDER_IDS_REQUIRED',
      );
    }
    if (deduped.length > 200) {
      throw new ApiException(
        'order_ids는 최대 200개까지 허용됩니다',
        400,
        'V2_ADMIN_BULK_ORDER_IDS_TOO_MANY',
      );
    }

    for (const orderId of deduped) {
      if (!this.isUuid(orderId)) {
        throw new ApiException(
          `order_id UUID 형식이 올바르지 않습니다: ${orderId}`,
          400,
          'V2_ADMIN_BULK_ORDER_ID_INVALID',
        );
      }
    }

    return deduped;
  }

  private normalizeBulkPreviewLimit(raw?: string | number): number {
    if (raw === undefined || raw === null) {
      return 20;
    }
    const parsed =
      typeof raw === 'number' ? Math.trunc(raw) : Number.parseInt(String(raw), 10);
    if (Number.isNaN(parsed)) {
      return 20;
    }
    return Math.max(1, Math.min(100, parsed));
  }

  private normalizeBulkActor(input?: {
    id?: string | null;
    email?: string | null;
    isLocalBypass?: boolean;
  }): {
    id: string | null;
    email: string | null;
    isLocalBypass: boolean;
  } {
    const actorId = this.normalizeOptionalText(input?.id || null);
    return {
      id: actorId && this.isUuid(actorId) ? actorId : null,
      email: this.normalizeOptionalText(input?.email || null),
      isLocalBypass: Boolean(input?.isLocalBypass),
    };
  }

  private async fetchBulkTargetOrders(orderIds: string[]): Promise<Map<string, any>> {
    const { data, error } = await this.supabase
      .from('v2_orders')
      .select('id, order_no, order_status, payment_status, fulfillment_status')
      .in('id', orderIds);

    if (error) {
      throw new ApiException(
        'bulk 대상 주문 조회 실패',
        500,
        'V2_ADMIN_BULK_ORDERS_FETCH_FAILED',
      );
    }

    const map = new Map<string, any>();
    for (const row of data || []) {
      if (row?.id) {
        map.set(row.id as string, row);
      }
    }
    return map;
  }

  private async resolveBulkCandidatesByOrder(input: {
    actionKey: string;
    orderIds: string[];
    previewLimit: number;
  }): Promise<Map<string, any[]>> {
    const result = new Map<string, any[]>();
    const pushCandidate = (orderId: string, candidate: any) => {
      const list = result.get(orderId) || [];
      if (list.length >= input.previewLimit) {
        result.set(orderId, list);
        return;
      }
      list.push(candidate);
      result.set(orderId, list);
    };

    if (input.actionKey === 'FULFILLMENT_SHIPMENT_DISPATCH') {
      const { data, error } = await this.supabase
        .from('v2_admin_fulfillment_queue_view')
        .select('order_id, shipment_id, shipment_status')
        .in('order_id', input.orderIds)
        .eq('fulfillment_kind', 'SHIPMENT')
        .in('shipment_status', ['READY_TO_PACK', 'PACKING']);

      if (error) {
        throw new ApiException(
          'bulk shipment 후보 조회 실패',
          500,
          'V2_ADMIN_BULK_SHIPMENT_CANDIDATES_FETCH_FAILED',
        );
      }

      for (const row of data || []) {
        if (!row?.order_id || !row?.shipment_id) {
          continue;
        }
        pushCandidate(row.order_id as string, {
          resource_type: 'SHIPMENT',
          resource_id: row.shipment_id,
          current_status: row.shipment_status,
          transition_key: this.resolveBulkTransitionKey(input.actionKey),
        });
      }

      return result;
    }

    const entitlementAllowedStatuses =
      input.actionKey === 'FULFILLMENT_ENTITLEMENT_REISSUE'
        ? ['PENDING', 'GRANTED', 'EXPIRED']
        : ['PENDING', 'GRANTED', 'EXPIRED'];

    if (
      input.actionKey === 'FULFILLMENT_ENTITLEMENT_REISSUE' ||
      input.actionKey === 'FULFILLMENT_ENTITLEMENT_REVOKE'
    ) {
      const { data, error } = await this.supabase
        .from('v2_digital_entitlements')
        .select('id, order_id, status')
        .in('order_id', input.orderIds)
        .in('status', entitlementAllowedStatuses);

      if (error) {
        throw new ApiException(
          'bulk entitlement 후보 조회 실패',
          500,
          'V2_ADMIN_BULK_ENTITLEMENT_CANDIDATES_FETCH_FAILED',
        );
      }

      for (const row of data || []) {
        if (!row?.order_id || !row?.id) {
          continue;
        }
        pushCandidate(row.order_id as string, {
          resource_type: 'DIGITAL_ENTITLEMENT',
          resource_id: row.id,
          current_status: row.status,
          transition_key: this.resolveBulkTransitionKey(input.actionKey),
        });
      }
    }

    return result;
  }

  private resolveBulkTransitionKey(actionKey: string): string {
    if (actionKey === 'FULFILLMENT_SHIPMENT_DISPATCH') {
      return 'SHIPMENT_DISPATCH';
    }
    if (actionKey === 'FULFILLMENT_ENTITLEMENT_REISSUE') {
      return 'ENTITLEMENT_REISSUE';
    }
    if (actionKey === 'FULFILLMENT_ENTITLEMENT_REVOKE') {
      return 'ENTITLEMENT_REVOKE';
    }
    return 'ORDER_BULK_ACTION_REQUESTED';
  }

  private parseBoolean(raw?: string): boolean {
    if (!raw) {
      return false;
    }
    const normalized = raw.trim().toLowerCase();
    return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
  }

  private normalizeOptionalText(value?: string | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private isUuid(value: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  private readBooleanEnv(key: string, fallback: boolean): boolean {
    const value = process.env[key];
    if (!value) {
      return fallback;
    }
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }
    return fallback;
  }

  private readCsvEnv(key: string): string[] {
    const value = process.env[key];
    if (!value) {
      return [];
    }
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private readRolloutStage(): 'STAGE_1' | 'STAGE_2' | 'STAGE_3' {
    const value = (process.env.V2_ADMIN_ROLLOUT_STAGE || 'STAGE_1')
      .trim()
      .toUpperCase();
    if (value === 'STAGE_2' || value === 'STAGE_3') {
      return value;
    }
    return 'STAGE_1';
  }

  private readLegacyWriteMode(stage: 'STAGE_1' | 'STAGE_2' | 'STAGE_3'): string {
    const explicit = this.normalizeOptionalText(process.env.V2_ADMIN_LEGACY_WRITE_MODE);
    if (explicit) {
      return explicit;
    }
    if (stage === 'STAGE_3') {
      return 'READ_ONLY';
    }
    return 'LIMITED_WRITE';
  }

  private describeStage(stage: 'STAGE_1' | 'STAGE_2' | 'STAGE_3'): string {
    if (stage === 'STAGE_1') {
      return '권한/로그 오픈 + 민감 액션은 로그 중심으로 관찰';
    }
    if (stage === 'STAGE_2') {
      return 'v2 신규 도메인 액션 전환 + 승인 대상 액션 점진 강제';
    }
    return 'legacy write 제한 + v2 action executor 중심 운영';
  }
}
