import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { ApiException } from '../common/errors/api.exception';
import { getSupabaseClient } from '../supabase/supabase.client';
import { V2CheckoutService } from '../v2-checkout/v2-checkout.service';
import { V2FulfillmentService } from '../v2-fulfillment/v2-fulfillment.service';
import {
  V2AdminActionActor,
  V2AdminActionExecutorService,
} from './v2-admin-action-executor.service';

type V2OrderLinearStage =
  | 'PAYMENT_PENDING'
  | 'PAYMENT_CONFIRMED'
  | 'PRODUCTION'
  | 'READY_TO_SHIP'
  | 'IN_TRANSIT'
  | 'DELIVERED';

type V2OrderTransitionActionKey =
  | 'ORDER_PAYMENT_MARK_AUTHORIZED'
  | 'ORDER_PAYMENT_MARK_CAPTURED'
  | 'FULFILLMENT_SHIPMENT_DISPATCH'
  | 'FULFILLMENT_SHIPMENT_DELIVER'
  | 'FULFILLMENT_ENTITLEMENT_REISSUE';

interface OrderLinearTransitionAction {
  sequence: number;
  action_key: V2OrderTransitionActionKey;
  resource_type: 'ORDER' | 'SHIPMENT' | 'DIGITAL_ENTITLEMENT';
  resource_id: string;
  from_state: string | null;
  to_state: string | null;
  requires_approval: boolean;
  note: string | null;
}

interface OrderLinearTransitionRow {
  order_id: string;
  order_no: string | null;
  exists: boolean;
  current_stage: V2OrderLinearStage | null;
  target_stage: V2OrderLinearStage;
  executable: boolean;
  statuses: {
    order_status: string;
    payment_status: string;
    fulfillment_status: string;
  } | null;
  composition: {
    has_bundle: boolean;
    has_physical: boolean;
    has_digital: boolean;
  };
  action_count: number;
  actions: OrderLinearTransitionAction[];
  blocked_reasons: string[];
}

interface OrderLinearTransitionSummary {
  requested_order_count: number;
  found_order_count: number;
  executable_order_count: number;
  blocked_order_count: number;
  total_action_count: number;
}

interface EntitlementRow {
  id: string;
  order_id: string;
  status: string;
}

interface ShipmentRow {
  shipment_id: string;
  shipment_status: string | null;
}

const LINEAR_STAGE_ORDER: V2OrderLinearStage[] = [
  'PAYMENT_PENDING',
  'PAYMENT_CONFIRMED',
  'PRODUCTION',
  'READY_TO_SHIP',
  'IN_TRANSIT',
  'DELIVERED',
];

const PAYMENT_CAPTURED_STATUSES = new Set(['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUNDED']);
const MAX_ACTION_REQUEST_ID_LENGTH = 120;

@Injectable()
export class V2AdminOrderTransitionService {
  constructor(
    private readonly v2AdminActionExecutorService: V2AdminActionExecutorService,
    @Inject(forwardRef(() => V2FulfillmentService))
    private readonly v2FulfillmentService: V2FulfillmentService,
    @Inject(forwardRef(() => V2CheckoutService))
    private readonly v2CheckoutService: V2CheckoutService,
  ) {}

  private get supabase(): any {
    return getSupabaseClient() as any;
  }

  async preview(input: {
    orderIds?: string[];
    targetStage?: string;
    reason?: string | null;
    requestId?: string | null;
    metadata?: Record<string, unknown> | null;
    actor?: V2AdminActionActor;
  }): Promise<any> {
    return this.runTransition({
      mode: 'PREVIEW',
      ...input,
    });
  }

  async execute(input: {
    orderIds?: string[];
    targetStage?: string;
    reason?: string | null;
    requestId?: string | null;
    metadata?: Record<string, unknown> | null;
    actor?: V2AdminActionActor;
  }): Promise<any> {
    return this.runTransition({
      mode: 'EXECUTE',
      ...input,
    });
  }

  private async runTransition(input: {
    mode: 'PREVIEW' | 'EXECUTE';
    orderIds?: string[];
    targetStage?: string;
    reason?: string | null;
    requestId?: string | null;
    metadata?: Record<string, unknown> | null;
    actor?: V2AdminActionActor;
  }): Promise<any> {
    const targetStage = this.normalizeTargetStage(input.targetStage);
    const orderIds = this.normalizeOrderIds(input.orderIds);
    const reason = this.normalizeOptionalText(input.reason);
    const requestId = this.normalizeOptionalText(input.requestId);
    const metadata = this.normalizeOptionalJsonObject(input.metadata) || {};
    const actor = this.normalizeActor(input.actor);
    const requestedAt = new Date().toISOString();

    const ordersById = await this.fetchOrdersById(orderIds);
    const queueByOrderId = await this.fetchOrderQueueByOrderId(orderIds);
    const shipmentsByOrderId = await this.fetchShipmentsByOrderId(orderIds);
    const entitlementsByOrderId = await this.fetchEntitlementsByOrderId(orderIds);

    const rows = orderIds.map((orderId) => {
      const order = ordersById.get(orderId) || null;
      const queue = queueByOrderId.get(orderId) || null;
      const shipments = shipmentsByOrderId.get(orderId) || [];
      const entitlements = entitlementsByOrderId.get(orderId) || [];
      return this.buildTransitionRow({
        orderId,
        order,
        queue,
        shipments,
        entitlements,
        targetStage,
      });
    });

    const summary = this.buildSummary(orderIds, rows);

    if (input.mode === 'PREVIEW') {
      return {
        mode: 'PREVIEW',
        requested_at: requestedAt,
        target_stage: targetStage,
        summary,
        rows,
      };
    }

    const executionLogs: any[] = [];
    for (const row of rows) {
      if (!row.exists || !row.executable || row.actions.length === 0) {
        continue;
      }

      for (let index = 0; index < row.actions.length; index += 1) {
        const action = row.actions[index];
        const log = await this.executeAction({
          row,
          action,
          actionIndex: index,
          actor,
          targetStage,
          reason,
          requestId,
          metadata,
        });
        executionLogs.push(log);

        if (log.status === 'FAILED') {
          break;
        }
      }
    }

    const executeSummary = {
      attempted_action_count: executionLogs.length,
      succeeded_count: executionLogs.filter((item) => item.status === 'SUCCEEDED')
        .length,
      pending_approval_count: executionLogs.filter(
        (item) => item.status === 'PENDING_APPROVAL',
      ).length,
      failed_count: executionLogs.filter((item) => item.status === 'FAILED').length,
    };

    return {
      mode: 'EXECUTE',
      requested_at: requestedAt,
      target_stage: targetStage,
      summary,
      rows,
      execute: {
        ...executeSummary,
        logs: executionLogs,
      },
    };
  }

  private buildSummary(
    orderIds: string[],
    rows: OrderLinearTransitionRow[],
  ): OrderLinearTransitionSummary {
    return {
      requested_order_count: orderIds.length,
      found_order_count: rows.filter((row) => row.exists).length,
      executable_order_count: rows.filter((row) => row.executable).length,
      blocked_order_count: rows.filter((row) => row.blocked_reasons.length > 0).length,
      total_action_count: rows.reduce(
        (sum, row) => sum + Number(row.action_count || 0),
        0,
      ),
    };
  }

  private buildTransitionRow(input: {
    orderId: string;
    order: any | null;
    queue: any | null;
    shipments: ShipmentRow[];
    entitlements: EntitlementRow[];
    targetStage: V2OrderLinearStage;
  }): OrderLinearTransitionRow {
    if (!input.order) {
      return {
        order_id: input.orderId,
        order_no: null,
        exists: false,
        current_stage: null,
        target_stage: input.targetStage,
        executable: false,
        statuses: null,
        composition: {
          has_bundle: false,
          has_physical: false,
          has_digital: false,
        },
        action_count: 0,
        actions: [],
        blocked_reasons: ['주문이 존재하지 않습니다.'],
      };
    }

    const composition = {
      has_bundle: Boolean(input.queue?.has_bundle),
      has_physical:
        Boolean(input.queue?.has_physical) || input.shipments.length > 0,
      has_digital:
        Boolean(input.queue?.has_digital) || input.entitlements.length > 0,
    };

    const statuses = {
      order_status: String(input.order.order_status || ''),
      payment_status: String(input.order.payment_status || ''),
      fulfillment_status: String(input.order.fulfillment_status || ''),
    };

    const currentStage = this.resolveCurrentStage({
      paymentStatus: statuses.payment_status,
      composition,
      shipments: input.shipments,
      entitlements: input.entitlements,
    });

    const blockedReasons: string[] = [];
    const actions: OrderLinearTransitionAction[] = [];
    let sequence = 1;

    const currentStageIndex = LINEAR_STAGE_ORDER.indexOf(currentStage);
    const targetStageIndex = LINEAR_STAGE_ORDER.indexOf(input.targetStage);

    if (targetStageIndex < currentStageIndex) {
      blockedReasons.push(
        `현재 단계(${this.linearStageLabel(currentStage)})보다 이전 단계(${this.linearStageLabel(
          input.targetStage,
        )})로는 전환할 수 없습니다.`,
      );
    }

    const paymentStatus = String(statuses.payment_status || '').toUpperCase();
    const paymentNeedsAuthorize =
      paymentStatus === 'PENDING' || paymentStatus === 'FAILED';
    const paymentNeedsCapture = !PAYMENT_CAPTURED_STATUSES.has(paymentStatus);

    const addAction = (action: Omit<OrderLinearTransitionAction, 'sequence'>) => {
      actions.push({
        sequence,
        ...action,
      });
      sequence += 1;
    };

    const addPaymentActionsUpToCaptured = () => {
      if (paymentNeedsAuthorize) {
        addAction({
          action_key: 'ORDER_PAYMENT_MARK_AUTHORIZED',
          resource_type: 'ORDER',
          resource_id: input.order.id,
          from_state: statuses.payment_status,
          to_state: 'AUTHORIZED',
          requires_approval: false,
          note: '입금 확인(결제 AUTHORIZED) 처리',
        });
      }

      if (paymentNeedsCapture) {
        addAction({
          action_key: 'ORDER_PAYMENT_MARK_CAPTURED',
          resource_type: 'ORDER',
          resource_id: input.order.id,
          from_state: paymentNeedsAuthorize ? 'AUTHORIZED' : statuses.payment_status,
          to_state: 'CAPTURED',
          requires_approval: false,
          note: '결제 확정(CAPTURED) 처리',
        });
      }
    };

    const shipmentStatus = (shipment: ShipmentRow) =>
      String(shipment.shipment_status || '').toUpperCase();
    const entitlementStatus = (entitlement: EntitlementRow) =>
      String(entitlement.status || '').toUpperCase();

    if (blockedReasons.length === 0) {
      if (paymentStatus === 'CANCELED' && input.targetStage !== 'PAYMENT_PENDING') {
        blockedReasons.push(
          '결제 상태가 CANCELED인 주문은 선형 단계 전환을 자동 실행할 수 없습니다.',
        );
      }

      if (input.targetStage === 'PAYMENT_CONFIRMED') {
        if (paymentNeedsAuthorize) {
          addAction({
            action_key: 'ORDER_PAYMENT_MARK_AUTHORIZED',
            resource_type: 'ORDER',
            resource_id: input.order.id,
            from_state: statuses.payment_status,
            to_state: 'AUTHORIZED',
            requires_approval: false,
            note: '입금 확인(결제 AUTHORIZED) 처리',
          });
        } else if (paymentStatus !== 'AUTHORIZED') {
          blockedReasons.push(
            `현재 결제 상태(${paymentStatus})에서는 입금 확인 단계로 전환할 수 없습니다.`,
          );
        }
      }

      if (input.targetStage === 'PRODUCTION') {
        if (paymentNeedsCapture) {
          addPaymentActionsUpToCaptured();
        }
      }

      if (input.targetStage === 'READY_TO_SHIP') {
        if (!composition.has_physical) {
          blockedReasons.push(
            '실물 이행이 없는 주문은 배송 대기 단계로 전환할 수 없습니다.',
          );
        } else if (input.shipments.length === 0) {
          blockedReasons.push('실물 shipment가 없어 배송 대기 전환을 수행할 수 없습니다.');
        } else {
          if (paymentNeedsCapture) {
            addPaymentActionsUpToCaptured();
          }

          for (const shipment of input.shipments) {
            const status = shipmentStatus(shipment);
            if (status === 'PENDING') {
              blockedReasons.push(
                `shipment(${shipment.shipment_id}) 상태가 PENDING이라 자동 배송대기 전환이 불가합니다.`,
              );
            }
          }
        }
      }

      if (input.targetStage === 'IN_TRANSIT') {
        if (!composition.has_physical) {
          blockedReasons.push(
            '실물 이행이 없는 주문은 배송 중 단계로 전환할 수 없습니다.',
          );
        } else if (input.shipments.length === 0) {
          blockedReasons.push('실물 shipment가 없어 배송 중 전환을 수행할 수 없습니다.');
        } else {
          if (paymentNeedsCapture) {
            addPaymentActionsUpToCaptured();
          }

          for (const shipment of input.shipments) {
            const status = shipmentStatus(shipment);
            if (status === 'READY_TO_PACK' || status === 'PACKING') {
              addAction({
                action_key: 'FULFILLMENT_SHIPMENT_DISPATCH',
                resource_type: 'SHIPMENT',
                resource_id: shipment.shipment_id,
                from_state: status,
                to_state: 'SHIPPED',
                requires_approval: false,
                note: '배송 중 전환을 위한 출고 처리',
              });
            } else if (status === 'PENDING') {
              blockedReasons.push(
                `shipment(${shipment.shipment_id}) 상태가 PENDING이라 자동 출고가 불가합니다.`,
              );
            }
          }
        }
      }

      if (input.targetStage === 'DELIVERED') {
        if (paymentNeedsCapture) {
          addPaymentActionsUpToCaptured();
        }

        if (composition.has_physical) {
          if (input.shipments.length === 0) {
            blockedReasons.push(
              '실물 shipment가 없어 배송 완료 전환을 수행할 수 없습니다.',
            );
          } else {
            for (const shipment of input.shipments) {
              const status = shipmentStatus(shipment);
              if (status === 'READY_TO_PACK' || status === 'PACKING') {
                addAction({
                  action_key: 'FULFILLMENT_SHIPMENT_DISPATCH',
                  resource_type: 'SHIPMENT',
                  resource_id: shipment.shipment_id,
                  from_state: status,
                  to_state: 'SHIPPED',
                  requires_approval: false,
                  note: '배송 완료 전환을 위한 출고 처리',
                });
                addAction({
                  action_key: 'FULFILLMENT_SHIPMENT_DELIVER',
                  resource_type: 'SHIPMENT',
                  resource_id: shipment.shipment_id,
                  from_state: 'SHIPPED',
                  to_state: 'DELIVERED',
                  requires_approval: false,
                  note: '배송 완료 처리',
                });
              } else if (status === 'SHIPPED' || status === 'IN_TRANSIT') {
                addAction({
                  action_key: 'FULFILLMENT_SHIPMENT_DELIVER',
                  resource_type: 'SHIPMENT',
                  resource_id: shipment.shipment_id,
                  from_state: status,
                  to_state: 'DELIVERED',
                  requires_approval: false,
                  note: '배송 완료 처리',
                });
              } else if (status === 'PENDING') {
                blockedReasons.push(
                  `shipment(${shipment.shipment_id}) 상태가 PENDING이라 자동 배송완료 전환이 불가합니다.`,
                );
              }
            }
          }
        }

        if (composition.has_digital) {
          if (input.entitlements.length === 0) {
            blockedReasons.push(
              '디지털 entitlement가 없어 디지털 완료 전환을 수행할 수 없습니다.',
            );
          } else {
            for (const entitlement of input.entitlements) {
              const status = entitlementStatus(entitlement);
              if (status === 'PENDING' || status === 'EXPIRED') {
                addAction({
                  action_key: 'FULFILLMENT_ENTITLEMENT_REISSUE',
                  resource_type: 'DIGITAL_ENTITLEMENT',
                  resource_id: entitlement.id,
                  from_state: status,
                  to_state: 'GRANTED',
                  requires_approval: false,
                  note: '디지털 권한 지급(재발급) 처리',
                });
              } else if (status === 'FAILED' || status === 'REVOKED') {
                blockedReasons.push(
                  `entitlement(${entitlement.id}) 상태가 ${status}라 자동 지급 처리할 수 없습니다.`,
                );
              }
            }
          }
        }
      }
    }

    return {
      order_id: input.orderId,
      order_no: String(input.order.order_no || ''),
      exists: true,
      current_stage: currentStage,
      target_stage: input.targetStage,
      executable: blockedReasons.length === 0,
      statuses,
      composition,
      action_count: actions.length,
      actions,
      blocked_reasons: blockedReasons,
    };
  }

  private resolveCurrentStage(input: {
    paymentStatus: string;
    composition: {
      has_bundle: boolean;
      has_physical: boolean;
      has_digital: boolean;
    };
    shipments: ShipmentRow[];
    entitlements: EntitlementRow[];
  }): V2OrderLinearStage {
    const paymentStatus = String(input.paymentStatus || '').toUpperCase();
    if (paymentStatus === 'AUTHORIZED') {
      return 'PAYMENT_CONFIRMED';
    }
    if (!PAYMENT_CAPTURED_STATUSES.has(paymentStatus)) {
      return 'PAYMENT_PENDING';
    }

    if (input.composition.has_physical) {
      const shipmentStatuses = input.shipments.map((shipment) =>
        String(shipment.shipment_status || '').toUpperCase(),
      );
      const hasInTransit = shipmentStatuses.some(
        (status) => status === 'SHIPPED' || status === 'IN_TRANSIT',
      );
      const hasWaiting = shipmentStatuses.some(
        (status) => status === 'READY_TO_PACK' || status === 'PACKING',
      );
      const allDelivered =
        shipmentStatuses.length > 0 &&
        shipmentStatuses.every((status) => status === 'DELIVERED');

      if (allDelivered) {
        if (input.composition.has_digital && input.entitlements.length > 0) {
          const hasPendingDigital = input.entitlements.some((entitlement) => {
            const status = String(entitlement.status || '').toUpperCase();
            return status !== 'GRANTED';
          });
          if (hasPendingDigital) {
            return 'IN_TRANSIT';
          }
        }
        return 'DELIVERED';
      }
      if (hasInTransit) {
        return 'IN_TRANSIT';
      }
      if (hasWaiting) {
        return 'READY_TO_SHIP';
      }
      return 'PRODUCTION';
    }

    if (input.composition.has_digital) {
      if (input.entitlements.length === 0) {
        return 'PRODUCTION';
      }
      const allGranted = input.entitlements.every((entitlement) => {
        const status = String(entitlement.status || '').toUpperCase();
        return status === 'GRANTED';
      });
      return allGranted ? 'DELIVERED' : 'PRODUCTION';
    }

    return 'PRODUCTION';
  }

  private async executeAction(input: {
    row: OrderLinearTransitionRow;
    action: OrderLinearTransitionAction;
    actionIndex: number;
    actor: V2AdminActionActor;
    targetStage: V2OrderLinearStage;
    reason: string | null;
    requestId: string | null;
    metadata: Record<string, unknown>;
  }): Promise<any> {
    const actionRequestId = this.buildActionRequestId({
      requestId: input.requestId,
      row: input.row,
      action: input.action,
      actionIndex: input.actionIndex,
    });

    try {
      if (input.action.action_key === 'ORDER_PAYMENT_MARK_AUTHORIZED') {
        const execution = await this.v2AdminActionExecutorService.execute({
          actionKey: 'ORDER_PAYMENT_MARK_AUTHORIZED',
          domain: 'ORDER',
          actor: input.actor,
          resourceType: 'ORDER',
          resourceId: input.action.resource_id,
          requestId: actionRequestId,
          inputPayload: {
            source: 'ORDER_LINEAR_STAGE_TRANSITION',
            order_id: input.row.order_id,
            order_no: input.row.order_no,
            target_stage: input.targetStage,
            reason: input.reason,
            metadata: input.metadata,
          },
          transition: () => ({
            transitionKey: 'ORDER_PAYMENT_AUTHORIZE',
            fromState: input.action.from_state,
            toState: input.action.to_state,
            reason: input.reason,
          }),
          execute: () =>
            this.v2CheckoutService.applyPaymentCallback(input.row.order_id, {
              external_reference: `ADMIN-LINEAR-${Date.now()}-${input.row.order_id}`,
              status: 'AUTHORIZED',
              provider: 'MANUAL',
              method: 'MANUAL',
              metadata: {
                source: 'ORDER_LINEAR_STAGE_TRANSITION',
                target_stage: input.targetStage,
                reason: input.reason,
                order_no: input.row.order_no,
              },
            }),
        });
        return {
          status: 'SUCCEEDED',
          order_id: input.row.order_id,
          order_no: input.row.order_no,
          action_key: input.action.action_key,
          resource_type: input.action.resource_type,
          resource_id: input.action.resource_id,
          action_log_id: execution.action_log_id,
        };
      }

      if (input.action.action_key === 'ORDER_PAYMENT_MARK_CAPTURED') {
        const execution = await this.v2AdminActionExecutorService.execute({
          actionKey: 'ORDER_PAYMENT_MARK_CAPTURED',
          domain: 'ORDER',
          actor: input.actor,
          resourceType: 'ORDER',
          resourceId: input.action.resource_id,
          requestId: actionRequestId,
          inputPayload: {
            source: 'ORDER_LINEAR_STAGE_TRANSITION',
            order_id: input.row.order_id,
            order_no: input.row.order_no,
            target_stage: input.targetStage,
            reason: input.reason,
            metadata: input.metadata,
          },
          transition: () => ({
            transitionKey: 'ORDER_PAYMENT_CAPTURE',
            fromState: input.action.from_state,
            toState: input.action.to_state,
            reason: input.reason,
          }),
          execute: () =>
            this.v2CheckoutService.applyPaymentCallback(input.row.order_id, {
              external_reference: `ADMIN-LINEAR-${Date.now()}-${input.row.order_id}`,
              status: 'CAPTURED',
              provider: 'MANUAL',
              method: 'MANUAL',
              metadata: {
                source: 'ORDER_LINEAR_STAGE_TRANSITION',
                target_stage: input.targetStage,
                reason: input.reason,
                order_no: input.row.order_no,
              },
            }),
        });
        return {
          status: 'SUCCEEDED',
          order_id: input.row.order_id,
          order_no: input.row.order_no,
          action_key: input.action.action_key,
          resource_type: input.action.resource_type,
          resource_id: input.action.resource_id,
          action_log_id: execution.action_log_id,
        };
      }

      if (input.action.action_key === 'FULFILLMENT_SHIPMENT_DISPATCH') {
        const execution = await this.v2AdminActionExecutorService.execute({
          actionKey: 'FULFILLMENT_SHIPMENT_DISPATCH',
          domain: 'FULFILLMENT',
          actor: input.actor,
          requiredPermissionCode: 'FULFILLMENT_EXECUTE',
          resourceType: 'SHIPMENT',
          resourceId: input.action.resource_id,
          requestId: actionRequestId,
          inputPayload: {
            source: 'ORDER_LINEAR_STAGE_TRANSITION',
            order_id: input.row.order_id,
            order_no: input.row.order_no,
            target_stage: input.targetStage,
            reason: input.reason,
            metadata: input.metadata,
          },
          transition: () => ({
            transitionKey: 'SHIPMENT_DISPATCH',
            fromState: input.action.from_state,
            toState: input.action.to_state,
            reason: input.reason,
          }),
          execute: () =>
            this.v2FulfillmentService.dispatchShipment(input.action.resource_id, {
              metadata: {
                source: 'ORDER_LINEAR_STAGE_TRANSITION',
                target_stage: input.targetStage,
                order_id: input.row.order_id,
                order_no: input.row.order_no,
                reason: input.reason,
              },
            }),
        });
        return {
          status: 'SUCCEEDED',
          order_id: input.row.order_id,
          order_no: input.row.order_no,
          action_key: input.action.action_key,
          resource_type: input.action.resource_type,
          resource_id: input.action.resource_id,
          action_log_id: execution.action_log_id,
        };
      }

      if (input.action.action_key === 'FULFILLMENT_SHIPMENT_DELIVER') {
        const execution = await this.v2AdminActionExecutorService.execute({
          actionKey: 'FULFILLMENT_SHIPMENT_DELIVER',
          domain: 'FULFILLMENT',
          actor: input.actor,
          requiredPermissionCode: 'FULFILLMENT_EXECUTE',
          resourceType: 'SHIPMENT',
          resourceId: input.action.resource_id,
          requestId: actionRequestId,
          inputPayload: {
            source: 'ORDER_LINEAR_STAGE_TRANSITION',
            order_id: input.row.order_id,
            order_no: input.row.order_no,
            target_stage: input.targetStage,
            reason: input.reason,
            metadata: input.metadata,
          },
          transition: () => ({
            transitionKey: 'SHIPMENT_DELIVER',
            fromState: input.action.from_state,
            toState: input.action.to_state,
            reason: input.reason,
          }),
          execute: () =>
            this.v2FulfillmentService.deliverShipment(input.action.resource_id, {
              metadata: {
                source: 'ORDER_LINEAR_STAGE_TRANSITION',
                target_stage: input.targetStage,
                order_id: input.row.order_id,
                order_no: input.row.order_no,
                reason: input.reason,
              },
            }),
        });
        return {
          status: 'SUCCEEDED',
          order_id: input.row.order_id,
          order_no: input.row.order_no,
          action_key: input.action.action_key,
          resource_type: input.action.resource_type,
          resource_id: input.action.resource_id,
          action_log_id: execution.action_log_id,
        };
      }

      if (input.action.action_key === 'FULFILLMENT_ENTITLEMENT_REISSUE') {
        const execution = await this.v2AdminActionExecutorService.execute({
          actionKey: 'FULFILLMENT_ENTITLEMENT_REISSUE',
          domain: 'FULFILLMENT',
          actor: input.actor,
          requiredPermissionCode: 'ENTITLEMENT_REISSUE',
          resourceType: 'DIGITAL_ENTITLEMENT',
          resourceId: input.action.resource_id,
          requestId: actionRequestId,
          inputPayload: {
            source: 'ORDER_LINEAR_STAGE_TRANSITION',
            order_id: input.row.order_id,
            order_no: input.row.order_no,
            target_stage: input.targetStage,
            reason: input.reason,
            metadata: input.metadata,
          },
          transition: () => ({
            transitionKey: 'ENTITLEMENT_REISSUE',
            fromState: input.action.from_state,
            toState: input.action.to_state,
            reason: input.reason,
          }),
          execute: () =>
            this.v2FulfillmentService.reissueEntitlement(input.action.resource_id, {
              metadata: {
                source: 'ORDER_LINEAR_STAGE_TRANSITION',
                target_stage: input.targetStage,
                order_id: input.row.order_id,
                order_no: input.row.order_no,
                reason: input.reason,
              },
            }),
        });
        return {
          status: 'SUCCEEDED',
          order_id: input.row.order_id,
          order_no: input.row.order_no,
          action_key: input.action.action_key,
          resource_type: input.action.resource_type,
          resource_id: input.action.resource_id,
          action_log_id: execution.action_log_id,
        };
      }

      throw new ApiException(
        `지원하지 않는 전환 액션입니다: ${input.action.action_key}`,
        400,
        'V2_ADMIN_ORDER_LINEAR_ACTION_UNSUPPORTED',
      );
    } catch (error) {
      const parsed = this.parseActionError(error);
      const actionLogId = await this.findActionLogIdByRequestId(actionRequestId);
      const pendingApproval = parsed.error_code === 'V2_ADMIN_APPROVAL_REQUIRED';
      return {
        status: pendingApproval ? 'PENDING_APPROVAL' : 'FAILED',
        order_id: input.row.order_id,
        order_no: input.row.order_no,
        action_key: input.action.action_key,
        resource_type: input.action.resource_type,
        resource_id: input.action.resource_id,
        action_log_id: actionLogId,
        error_code: parsed.error_code,
        error_message: parsed.message,
      };
    }
  }

  private buildActionRequestId(input: {
    requestId: string | null;
    row: OrderLinearTransitionRow;
    action: OrderLinearTransitionAction;
    actionIndex: number;
  }): string {
    const base =
      this.normalizeOptionalText(input.requestId) ||
      `linear-stage-${Date.now()}-${input.row.order_id}`;
    const rawRequestId = `${base}:${input.action.action_key}:${input.action.resource_id}:${input.actionIndex}`;

    if (rawRequestId.length <= MAX_ACTION_REQUEST_ID_LENGTH) {
      return rawRequestId;
    }

    const digest = createHash('sha1').update(rawRequestId).digest('hex').slice(0, 24);
    return `linear-stage:${input.action.action_key}:${input.actionIndex}:${digest}`.slice(
      0,
      MAX_ACTION_REQUEST_ID_LENGTH,
    );
  }

  private async findActionLogIdByRequestId(
    requestId: string,
  ): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('v2_admin_action_logs')
      .select('id, created_at')
      .eq('request_id', requestId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.id) {
      return null;
    }
    return data.id as string;
  }

  private parseActionError(error: unknown): {
    error_code: string;
    message: string;
  } {
    if (error instanceof ApiException) {
      const response = error.getResponse() as
        | string
        | { message?: string; errorCode?: string };
      if (typeof response === 'string') {
        return {
          error_code: 'API_EXCEPTION',
          message: response,
        };
      }
      return {
        error_code: response?.errorCode || 'API_EXCEPTION',
        message: response?.message || '전환 액션 실행 중 오류가 발생했습니다.',
      };
    }

    if (error instanceof Error) {
      return {
        error_code: 'UNEXPECTED_ERROR',
        message: error.message,
      };
    }

    return {
      error_code: 'UNEXPECTED_ERROR',
      message: '전환 액션 실행 중 알 수 없는 오류가 발생했습니다.',
    };
  }

  private normalizeTargetStage(raw?: string): V2OrderLinearStage {
    const normalized = this.normalizeRequiredText(
      raw,
      'target_stage가 필요합니다',
    ).toUpperCase() as V2OrderLinearStage;

    if (!LINEAR_STAGE_ORDER.includes(normalized)) {
      throw new ApiException(
        `지원하지 않는 target_stage 입니다: ${normalized}`,
        400,
        'V2_ADMIN_ORDER_LINEAR_STAGE_INVALID',
      );
    }
    return normalized;
  }

  private normalizeOrderIds(raw?: string[]): string[] {
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new ApiException(
        'order_ids 배열이 필요합니다',
        400,
        'V2_ADMIN_ORDER_LINEAR_IDS_REQUIRED',
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
        'V2_ADMIN_ORDER_LINEAR_IDS_REQUIRED',
      );
    }
    if (deduped.length > 200) {
      throw new ApiException(
        'order_ids는 최대 200개까지 허용됩니다',
        400,
        'V2_ADMIN_ORDER_LINEAR_IDS_TOO_MANY',
      );
    }

    for (const orderId of deduped) {
      if (!this.isUuid(orderId)) {
        throw new ApiException(
          `order_id UUID 형식이 올바르지 않습니다: ${orderId}`,
          400,
          'V2_ADMIN_ORDER_LINEAR_ID_INVALID',
        );
      }
    }

    return deduped;
  }

  private normalizeActor(actor?: V2AdminActionActor): V2AdminActionActor {
    const actorId = this.normalizeOptionalText(actor?.id || null);
    return {
      id: actorId && this.isUuid(actorId) ? actorId : null,
      email: this.normalizeOptionalText(actor?.email || null),
      isLocalBypass: Boolean(actor?.isLocalBypass),
    };
  }

  private async fetchOrdersById(orderIds: string[]): Promise<Map<string, any>> {
    const { data, error } = await this.supabase
      .from('v2_orders')
      .select(
        'id, order_no, order_status, payment_status, fulfillment_status, grand_total',
      )
      .in('id', orderIds);

    if (error) {
      throw new ApiException(
        '주문 조회 실패',
        500,
        'V2_ADMIN_ORDER_LINEAR_ORDERS_FETCH_FAILED',
      );
    }

    const map = new Map<string, any>();
    for (const row of data || []) {
      if (row?.id) {
        map.set(String(row.id), row);
      }
    }
    return map;
  }

  private async fetchOrderQueueByOrderId(
    orderIds: string[],
  ): Promise<Map<string, any>> {
    const { data, error } = await this.supabase
      .from('v2_admin_order_queue_view')
      .select(
        'order_id, has_bundle, has_physical, has_digital, waiting_shipment_count, in_transit_shipment_count, delivered_shipment_count',
      )
      .in('order_id', orderIds);

    if (error) {
      throw new ApiException(
        'order queue 조회 실패',
        500,
        'V2_ADMIN_ORDER_LINEAR_QUEUE_FETCH_FAILED',
      );
    }

    const map = new Map<string, any>();
    for (const row of data || []) {
      if (row?.order_id) {
        map.set(String(row.order_id), row);
      }
    }
    return map;
  }

  private async fetchShipmentsByOrderId(
    orderIds: string[],
  ): Promise<Map<string, ShipmentRow[]>> {
    const { data, error } = await this.supabase
      .from('v2_admin_fulfillment_queue_view')
      .select('order_id, shipment_id, shipment_status')
      .in('order_id', orderIds)
      .eq('fulfillment_kind', 'SHIPMENT')
      .not('shipment_id', 'is', null);

    if (error) {
      throw new ApiException(
        'shipment 조회 실패',
        500,
        'V2_ADMIN_ORDER_LINEAR_SHIPMENT_FETCH_FAILED',
      );
    }

    const map = new Map<string, ShipmentRow[]>();
    for (const row of data || []) {
      const orderId = this.normalizeOptionalText(row.order_id);
      const shipmentId = this.normalizeOptionalText(row.shipment_id);
      if (!orderId || !shipmentId) {
        continue;
      }
      const list = map.get(orderId) || [];
      list.push({
        shipment_id: shipmentId,
        shipment_status: this.normalizeOptionalText(row.shipment_status),
      });
      map.set(orderId, list);
    }
    return map;
  }

  private async fetchEntitlementsByOrderId(
    orderIds: string[],
  ): Promise<Map<string, EntitlementRow[]>> {
    const { data, error } = await this.supabase
      .from('v2_digital_entitlements')
      .select('id, order_id, status')
      .in('order_id', orderIds)
      .in('status', ['PENDING', 'GRANTED', 'EXPIRED', 'FAILED', 'REVOKED']);

    if (error) {
      throw new ApiException(
        'entitlement 조회 실패',
        500,
        'V2_ADMIN_ORDER_LINEAR_ENTITLEMENT_FETCH_FAILED',
      );
    }

    const map = new Map<string, EntitlementRow[]>();
    for (const row of data || []) {
      const orderId = this.normalizeOptionalText(row.order_id);
      const entitlementId = this.normalizeOptionalText(row.id);
      if (!orderId || !entitlementId) {
        continue;
      }
      const list = map.get(orderId) || [];
      list.push({
        id: entitlementId,
        order_id: orderId,
        status: this.normalizeOptionalText(row.status) || 'PENDING',
      });
      map.set(orderId, list);
    }
    return map;
  }

  private linearStageLabel(stage: V2OrderLinearStage): string {
    if (stage === 'PAYMENT_PENDING') {
      return '입금 대기';
    }
    if (stage === 'PAYMENT_CONFIRMED') {
      return '입금 확인';
    }
    if (stage === 'PRODUCTION') {
      return '제작중';
    }
    if (stage === 'READY_TO_SHIP') {
      return '배송 대기';
    }
    if (stage === 'IN_TRANSIT') {
      return '배송 중';
    }
    return '배송 완료';
  }

  private normalizeRequiredText(
    value: string | null | undefined,
    message: string,
  ): string {
    const normalized = this.normalizeOptionalText(value);
    if (!normalized) {
      throw new ApiException(message, 400, 'V2_ADMIN_REQUIRED_FIELD');
    }
    return normalized;
  }

  private normalizeOptionalText(value?: string | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeOptionalJsonObject(
    value?: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new ApiException(
        'metadata는 JSON object 형식이어야 합니다',
        400,
        'V2_ADMIN_JSON_INVALID',
      );
    }
    return value;
  }

  private isUuid(value: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }
}
