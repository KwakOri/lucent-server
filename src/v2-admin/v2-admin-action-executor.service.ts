import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';

export interface V2AdminActionActor {
  id: string | null;
  email: string | null;
  isLocalBypass: boolean;
}

export interface V2AdminTransitionInput {
  domain?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  transitionKey: string;
  fromState?: string | null;
  toState?: string | null;
  reason?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface V2AdminApprovalInput {
  required: boolean;
  assigneeRoleCode?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface ExecuteV2AdminActionInput<T> {
  actionKey: string;
  domain: string;
  actor: V2AdminActionActor;
  requiredPermissionCode?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  requestId?: string | null;
  inputPayload?: Record<string, unknown> | null;
  precheck?: () => Promise<Record<string, unknown> | null> | Record<string, unknown> | null;
  transition?:
    | (() => Promise<V2AdminTransitionInput[] | V2AdminTransitionInput | null>)
    | (() => V2AdminTransitionInput[] | V2AdminTransitionInput | null);
  approval?: V2AdminApprovalInput | null;
  execute: () => Promise<T>;
  mapExecutionResult?: (result: T) => Record<string, unknown>;
  mapResourceId?: (result: T) => string | null | undefined;
}

interface EvaluatedPermission {
  required_permission_code: string | null;
  granted: boolean;
  reason: string;
  role_codes: string[];
}

export interface ExecuteV2AdminActionResult<T> {
  action_log_id: string;
  result: T;
}

@Injectable()
export class V2AdminActionExecutorService {
  private get supabase(): any {
    return getSupabaseClient() as any;
  }

  async execute<T>(
    input: ExecuteV2AdminActionInput<T>,
  ): Promise<ExecuteV2AdminActionResult<T>> {
    const actionKey = this.normalizeRequiredText(
      input.actionKey,
      'actionKey는 필수입니다',
    );
    const domain = this.normalizeRequiredText(input.domain, 'domain은 필수입니다');
    const resourceType = this.normalizeOptionalText(input.resourceType);
    const resourceId = this.normalizeOptionalUuid(input.resourceId);
    const requestId = this.normalizeOptionalText(input.requestId);
    const inputPayload = this.normalizeOptionalJsonObject(input.inputPayload) || {};
    const approval = this.normalizeApproval(input.approval);
    const approvalEnforced = this.isApprovalEnforced(actionKey, approval.required);

    const { data: createdLog, error: createLogError } = await this.supabase
      .from('v2_admin_action_logs')
      .insert({
        action_key: actionKey,
        domain,
        resource_type: resourceType,
        resource_id: resourceId,
        actor_id: this.normalizeActorId(input.actor),
        actor_email_snapshot: this.normalizeOptionalText(input.actor.email),
        request_id: requestId,
        action_status: 'PENDING',
        requires_approval: approval.required,
        input_payload: inputPayload,
      })
      .select('id')
      .maybeSingle();

    if (createLogError || !createdLog?.id) {
      throw new ApiException(
        'admin action log 생성 실패',
        500,
        'V2_ADMIN_ACTION_LOG_CREATE_FAILED',
      );
    }

    const actionLogId = createdLog.id as string;
    let precheckResult: Record<string, unknown> = { ok: true };
    let permissionResult: Record<string, unknown> = {};
    let transitionResult: Record<string, unknown> = {};

    try {
      if (input.precheck) {
        precheckResult =
          this.normalizeOptionalJsonObject(await input.precheck()) || {
            ok: true,
          };
      }

      const evaluatedPermission = await this.evaluatePermission({
        actor: input.actor,
        requiredPermissionCode:
          this.normalizeOptionalText(input.requiredPermissionCode) || null,
      });

      permissionResult = {
        required_permission_code: evaluatedPermission.required_permission_code,
        granted: evaluatedPermission.granted,
        reason: evaluatedPermission.reason,
        role_codes: evaluatedPermission.role_codes,
        approval_required: approval.required,
        approval_enforced: approvalEnforced,
      };

      if (!evaluatedPermission.granted) {
        throw new ApiException(
          '해당 액션을 실행할 권한이 없습니다',
          403,
          'V2_ADMIN_ACTION_FORBIDDEN',
        );
      }

      const transitions = input.transition
        ? this.normalizeTransitions({
            domain,
            resourceType,
            resourceId,
            raw: await input.transition(),
          })
        : [];

      transitionResult = {
        count: transitions.length,
        items: transitions.map((transition) => ({
          resource_type: transition.resourceType,
          resource_id: transition.resourceId,
          transition_key: transition.transitionKey,
          from_state: transition.fromState,
          to_state: transition.toState,
          reason: transition.reason,
        })),
      };

      if (approval.required && approvalEnforced && !input.actor.isLocalBypass) {
        await this.createApprovalRequest({
          actionLogId,
          actionKey,
          domain,
          actorId: this.normalizeActorId(input.actor),
          assigneeRoleCode: approval.assigneeRoleCode,
          reason: approval.reason,
          metadata: approval.metadata,
        });

        throw new ApiException(
          '승인이 필요한 액션입니다',
          409,
          'V2_ADMIN_APPROVAL_REQUIRED',
        );
      }

      const result = await input.execute();

      if (transitions.length > 0) {
        const { error: transitionInsertError } = await this.supabase
          .from('v2_admin_state_transition_logs')
          .insert(
            transitions.map((transition) => ({
              action_log_id: actionLogId,
              domain: transition.domain,
              resource_type: transition.resourceType,
              resource_id: transition.resourceId,
              transition_key: transition.transitionKey,
              from_state: transition.fromState,
              to_state: transition.toState,
              reason: transition.reason,
              payload: transition.payload || {},
              actor_id: this.normalizeActorId(input.actor),
            })),
          );

        if (transitionInsertError) {
          throw new ApiException(
            'state transition log 저장 실패',
            500,
            'V2_ADMIN_STATE_TRANSITION_LOG_CREATE_FAILED',
          );
        }
      }

      const mappedResourceId = this.normalizeOptionalUuid(input.mapResourceId?.(result));
      const executionResult = input.mapExecutionResult
        ? input.mapExecutionResult(result)
        : this.normalizeOptionalJsonObject(result) || { ok: true };
      executionResult.approval = {
        required: approval.required,
        enforced: approvalEnforced,
        assignee_role_code: approval.assigneeRoleCode,
      };

      await this.updateActionLog(actionLogId, {
        action_status: 'SUCCEEDED',
        resource_id: mappedResourceId || resourceId,
        precheck_result: precheckResult,
        permission_result: permissionResult,
        transition_result: transitionResult,
        execution_result: executionResult,
        error_code: null,
        error_message: null,
        finished_at: new Date().toISOString(),
      });

      return {
        action_log_id: actionLogId,
        result,
      };
    } catch (error) {
      const parsed = this.parseError(error);
      const isApprovalPending = parsed.errorCode === 'V2_ADMIN_APPROVAL_REQUIRED';
      await this.updateActionLog(actionLogId, {
        action_status: isApprovalPending ? 'PENDING' : 'FAILED',
        requires_approval: approval.required,
        precheck_result: precheckResult,
        permission_result: permissionResult,
        transition_result: transitionResult,
        execution_result: {},
        error_code: parsed.errorCode,
        error_message: parsed.message,
        finished_at: isApprovalPending ? null : new Date().toISOString(),
      });
      throw error;
    }
  }

  private normalizeApproval(input?: V2AdminApprovalInput | null): {
    required: boolean;
    assigneeRoleCode: string | null;
    reason: string | null;
    metadata: Record<string, unknown>;
  } {
    if (!input?.required) {
      return {
        required: false,
        assigneeRoleCode: null,
        reason: null,
        metadata: {},
      };
    }

    return {
      required: true,
      assigneeRoleCode: this.normalizeOptionalText(input.assigneeRoleCode),
      reason: this.normalizeOptionalText(input.reason),
      metadata: this.normalizeOptionalJsonObject(input.metadata) || {},
    };
  }

  private isApprovalEnforced(actionKey: string, approvalRequired: boolean): boolean {
    if (!approvalRequired) {
      return false;
    }
    if (!this.readBooleanEnv('V2_ADMIN_APPROVAL_ENFORCED', false)) {
      return false;
    }

    const allowlist = this.readCsvEnv('V2_ADMIN_APPROVAL_ENFORCED_ACTIONS');
    if (allowlist.length === 0) {
      return true;
    }

    return allowlist.includes(actionKey);
  }

  private async createApprovalRequest(input: {
    actionLogId: string;
    actionKey: string;
    domain: string;
    actorId: string | null;
    assigneeRoleCode: string | null;
    reason: string | null;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.supabase
      .from('v2_admin_approval_requests')
      .insert({
        action_log_id: input.actionLogId,
        domain: input.domain,
        action_key: input.actionKey,
        requester_id: input.actorId,
        assignee_role_code: input.assigneeRoleCode,
        status: 'PENDING',
        decision_note: input.reason,
        metadata: input.metadata,
      });

    if (error) {
      throw new ApiException(
        'approval request 생성 실패',
        500,
        'V2_ADMIN_APPROVAL_REQUEST_CREATE_FAILED',
      );
    }
  }

  private async evaluatePermission(input: {
    actor: V2AdminActionActor;
    requiredPermissionCode: string | null;
  }): Promise<EvaluatedPermission> {
    const requiredPermissionCode = input.requiredPermissionCode;
    if (!requiredPermissionCode) {
      return {
        required_permission_code: null,
        granted: true,
        reason: 'NO_PERMISSION_REQUIRED',
        role_codes: [],
      };
    }

    if (input.actor.isLocalBypass) {
      return {
        required_permission_code: requiredPermissionCode,
        granted: true,
        reason: 'LOCAL_ADMIN_BYPASS',
        role_codes: ['LOCAL_ADMIN_BYPASS'],
      };
    }

    const actorId = this.normalizeActorId(input.actor);
    if (!actorId) {
      return {
        required_permission_code: requiredPermissionCode,
        granted: false,
        reason: 'ACTOR_NOT_UUID',
        role_codes: [],
      };
    }

    const { data: userRoles, error: userRolesError } = await this.supabase
      .from('v2_admin_user_roles')
      .select('role_id, expires_at, role:v2_admin_roles(code, is_active)')
      .eq('user_id', actorId)
      .eq('status', 'ACTIVE');

    if (userRolesError) {
      throw new ApiException(
        'admin role 조회 실패',
        500,
        'V2_ADMIN_ROLE_FETCH_FAILED',
      );
    }

    const now = Date.now();
    const activeRoles = (userRoles || []).filter((row: any) => {
      if (!row?.role?.is_active) {
        return false;
      }
      if (!row.expires_at) {
        return true;
      }
      const expiresAt = Date.parse(row.expires_at as string);
      return Number.isNaN(expiresAt) || expiresAt > now;
    });

    if (activeRoles.length === 0) {
      return {
        required_permission_code: requiredPermissionCode,
        granted: false,
        reason: 'NO_ACTIVE_ROLE',
        role_codes: [],
      };
    }

    const roleById = new Map<string, string>();
    const roleIds = activeRoles
      .map((row: any) => {
        const roleId = this.normalizeOptionalUuid(row.role_id);
        if (!roleId) {
          return null;
        }
        const roleCode =
          this.normalizeOptionalText(row?.role?.code) || `ROLE:${roleId}`;
        roleById.set(roleId, roleCode);
        return roleId;
      })
      .filter(Boolean) as string[];

    if (roleIds.length === 0) {
      return {
        required_permission_code: requiredPermissionCode,
        granted: false,
        reason: 'NO_ACTIVE_ROLE',
        role_codes: [],
      };
    }

    const { data: permissions, error: permissionsError } = await this.supabase
      .from('v2_admin_role_permissions')
      .select('role_id, permission_code')
      .in('role_id', roleIds)
      .eq('is_active', true)
      .eq('permission_code', requiredPermissionCode);

    if (permissionsError) {
      throw new ApiException(
        'admin permission 조회 실패',
        500,
        'V2_ADMIN_PERMISSION_FETCH_FAILED',
      );
    }

    const grantedRoleCodes = Array.from(
      new Set(
        (permissions || [])
          .map((row: any) => roleById.get(row.role_id as string))
          .filter(Boolean),
      ),
    ) as string[];

    return {
      required_permission_code: requiredPermissionCode,
      granted: grantedRoleCodes.length > 0,
      reason:
        grantedRoleCodes.length > 0 ? 'PERMISSION_GRANTED' : 'PERMISSION_DENIED',
      role_codes: grantedRoleCodes,
    };
  }

  private normalizeTransitions(input: {
    domain: string;
    resourceType: string | null;
    resourceId: string | null;
    raw: V2AdminTransitionInput[] | V2AdminTransitionInput | null;
  }): Array<{
    domain: string;
    resourceType: string;
    resourceId: string;
    transitionKey: string;
    fromState: string | null;
    toState: string | null;
    reason: string | null;
    payload: Record<string, unknown>;
  }> {
    if (!input.raw) {
      return [];
    }

    const rawItems = Array.isArray(input.raw) ? input.raw : [input.raw];

    return rawItems.map((item) => {
      const domain = this.normalizeOptionalText(item.domain) || input.domain;
      const resourceType =
        this.normalizeOptionalText(item.resourceType) || input.resourceType;
      const resourceId =
        this.normalizeOptionalUuid(item.resourceId) || input.resourceId;
      const transitionKey = this.normalizeRequiredText(
        item.transitionKey,
        'transitionKey는 필수입니다',
      );

      if (!resourceType || !resourceId) {
        throw new ApiException(
          'transition log에는 resource_type/resource_id가 필요합니다',
          400,
          'V2_ADMIN_TRANSITION_RESOURCE_REQUIRED',
        );
      }

      return {
        domain,
        resourceType,
        resourceId,
        transitionKey,
        fromState: this.normalizeOptionalText(item.fromState),
        toState: this.normalizeOptionalText(item.toState),
        reason: this.normalizeOptionalText(item.reason),
        payload: this.normalizeOptionalJsonObject(item.payload) || {},
      };
    });
  }

  private async updateActionLog(
    actionLogId: string,
    updates: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await this.supabase
      .from('v2_admin_action_logs')
      .update(updates)
      .eq('id', actionLogId);

    if (error) {
      throw new ApiException(
        'admin action log 업데이트 실패',
        500,
        'V2_ADMIN_ACTION_LOG_UPDATE_FAILED',
      );
    }
  }

  private parseError(error: unknown): {
    statusCode: number;
    errorCode: string;
    message: string;
  } {
    if (error instanceof ApiException) {
      const response = error.getResponse() as any;
      const message =
        this.normalizeOptionalText(response?.message) || error.message;
      const errorCode =
        this.normalizeOptionalText(response?.errorCode) || 'API_EXCEPTION';
      return {
        statusCode: error.getStatus(),
        errorCode,
        message,
      };
    }

    if (error instanceof Error) {
      return {
        statusCode: 500,
        errorCode: 'UNEXPECTED_ERROR',
        message: error.message || 'unexpected error',
      };
    }

    return {
      statusCode: 500,
      errorCode: 'UNEXPECTED_ERROR',
      message: 'unexpected error',
    };
  }

  private normalizeRequiredText(value: unknown, errorMessage: string): string {
    if (typeof value !== 'string') {
      throw new ApiException(errorMessage, 400, 'INVALID_INPUT');
    }
    const normalized = value.trim();
    if (!normalized) {
      throw new ApiException(errorMessage, 400, 'INVALID_INPUT');
    }
    return normalized;
  }

  private normalizeOptionalText(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private normalizeOptionalUuid(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        normalized,
      )
    ) {
      return normalized;
    }
    return null;
  }

  private normalizeOptionalJsonObject(
    value: unknown,
  ): Record<string, unknown> | null {
    if (!value) {
      return null;
    }
    if (Array.isArray(value)) {
      return { items: value as unknown[] };
    }
    if (typeof value === 'object') {
      return value as Record<string, unknown>;
    }
    return { value };
  }

  private normalizeActorId(actor: V2AdminActionActor): string | null {
    return this.normalizeOptionalUuid(actor.id);
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
}
