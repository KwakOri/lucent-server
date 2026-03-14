import { Injectable } from '@nestjs/common';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';

@Injectable()
export class V2AdminService {
  private get supabase(): any {
    return getSupabaseClient() as any;
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
}
