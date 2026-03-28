import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { SendonService } from '../sendon/sendon.service';
import { SendonAlimtalkRecipient } from '../sendon/sendon.types';
import { getSupabaseClient } from '../supabase/supabase.client';

type CommerceNotificationEvent =
  | 'ORDER_PLACED'
  | 'PAYMENT_CAPTURED'
  | 'SHIPMENT_DISPATCHED'
  | 'SHIPMENT_DELIVERED';

interface CommerceNotificationContext {
  event: CommerceNotificationEvent;
  order: any;
  shipment?: any;
}

type NotificationPersistStatus = 'ACCEPTED' | 'FAILED' | 'DISABLED' | 'SKIPPED';

@Injectable()
export class CommerceNotificationsService {
  private readonly logger = new Logger(CommerceNotificationsService.name);
  private notificationLogUnavailable = false;

  private get supabase(): any {
    return getSupabaseClient() as any;
  }

  constructor(
    private readonly configService: AppConfigService,
    private readonly sendonService: SendonService,
  ) {}

  async notifyOrderPlaced(order: any): Promise<void> {
    await this.notify({
      event: 'ORDER_PLACED',
      order,
    });
  }

  async notifyPaymentCaptured(order: any): Promise<void> {
    await this.notify({
      event: 'PAYMENT_CAPTURED',
      order,
    });
  }

  async notifyShipmentDispatched(order: any, shipment: any): Promise<void> {
    await this.notify({
      event: 'SHIPMENT_DISPATCHED',
      order,
      shipment,
    });
  }

  async notifyShipmentDelivered(order: any, shipment: any): Promise<void> {
    await this.notify({
      event: 'SHIPMENT_DELIVERED',
      order,
      shipment,
    });
  }

  private async notify(input: CommerceNotificationContext): Promise<void> {
    const templateId = this.resolveTemplateId(input.event);
    const phone = this.resolveRecipientPhone(input.order);
    const variables = this.buildVariables(input);

    if (!this.configService.sendon.commerceNotifyEnabled) {
      await this.persistNotificationLog({
        input,
        templateId,
        phone,
        variables,
        status: 'SKIPPED',
        errorMessage: 'SENDON_COMMERCE_NOTIFY_DISABLED',
      });
      return;
    }

    const sendProfileId = this.configService.sendon.defaultSendProfileId.trim();
    if (!sendProfileId) {
      this.logger.warn(`Skip ${input.event}: SENDON_SEND_PROFILE_ID is empty.`);
      await this.persistNotificationLog({
        input,
        templateId,
        phone,
        variables,
        status: 'SKIPPED',
        errorMessage: 'SENDON_SEND_PROFILE_ID_EMPTY',
      });
      return;
    }

    if (!templateId) {
      this.logger.warn(
        `Skip ${input.event}: template id is empty. Set corresponding SENDON_TEMPLATE_* env.`,
      );
      await this.persistNotificationLog({
        input,
        templateId: null,
        phone,
        variables,
        status: 'SKIPPED',
        errorMessage: 'SENDON_TEMPLATE_ID_EMPTY',
      });
      return;
    }

    if (!phone) {
      this.logger.warn(
        `Skip ${input.event}: recipient phone not found for order=${this.resolveOrderRef(input.order)}.`,
      );
      await this.persistNotificationLog({
        input,
        templateId,
        phone: null,
        variables,
        status: 'SKIPPED',
        errorMessage: 'RECIPIENT_PHONE_NOT_FOUND',
      });
      return;
    }

    const recipient: SendonAlimtalkRecipient = {
      phone,
      variables,
    };

    const result = await this.sendonService.sendAlimtalk({
      sendProfileId,
      templateId,
      to: [recipient],
    });

    if (result.status !== 'accepted') {
      this.logger.warn(
        `Sendon ${input.event} was not accepted (status=${result.status}, order=${this.resolveOrderRef(
          input.order,
        )}, requestId=${result.requestId ?? 'none'}).`,
      );
      await this.persistNotificationLog({
        input,
        templateId,
        phone,
        variables,
        status: result.status === 'disabled' ? 'DISABLED' : 'FAILED',
        requestId: result.requestId,
        responsePayload: result.raw,
        errorMessage:
          result.status === 'disabled'
            ? 'SENDON_DISABLED'
            : 'SENDON_NOT_ACCEPTED',
      });
      return;
    }

    this.logger.log(
      `Sendon ${input.event} accepted (order=${this.resolveOrderRef(
        input.order,
      )}, requestId=${result.requestId ?? 'none'}).`,
    );

    await this.persistNotificationLog({
      input,
      templateId,
      phone,
      variables,
      status: 'ACCEPTED',
      requestId: result.requestId,
      responsePayload: result.raw,
      sentAt: new Date().toISOString(),
    });
  }

  private resolveTemplateId(event: CommerceNotificationEvent): string {
    const templates = this.configService.sendon.templates;
    if (event === 'ORDER_PLACED') {
      return templates.orderPlaced.trim();
    }
    if (event === 'PAYMENT_CAPTURED') {
      return templates.paymentCaptured.trim();
    }
    if (event === 'SHIPMENT_DISPATCHED') {
      return templates.shipmentDispatched.trim();
    }
    return templates.shipmentDelivered.trim();
  }

  private resolveRecipientPhone(order: any): string | null {
    const candidates = [
      this.pickText(order?.customer_snapshot, [
        'phone',
        'mobile',
        'phone_number',
        'recipient_phone',
      ]),
      this.pickText(order?.shipping_address_snapshot, [
        'phone',
        'mobile',
        'recipient_phone',
        'receiver_phone',
      ]),
      this.pickText(order?.metadata, ['customer_phone', 'phone']),
    ];

    for (const raw of candidates) {
      const normalized = this.normalizePhone(raw);
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  private buildVariables(
    input: CommerceNotificationContext,
  ): Record<string, string> {
    const order = input.order || {};
    const shipment = input.shipment || {};
    const customerName = this.resolveCustomerName(order);

    const base = {
      '#{order_no}': this.valueOrDash(order.order_no || order.id),
      '#{customer_name}': this.valueOrDash(customerName),
      '#{order_status}': this.valueOrDash(order.order_status),
      '#{payment_status}': this.valueOrDash(order.payment_status),
      '#{fulfillment_status}': this.valueOrDash(order.fulfillment_status),
      '#{order_amount}': this.formatKrw(order.grand_total),
      '#{ordered_at}': this.formatDateTime(order.placed_at),
    };

    if (input.event === 'PAYMENT_CAPTURED') {
      return {
        ...base,
        '#{payment_amount}': this.formatKrw(order.grand_total),
        '#{paid_at}': this.formatDateTime(order.confirmed_at),
      };
    }

    if (input.event === 'SHIPMENT_DISPATCHED') {
      return {
        ...base,
        '#{fulfillment_status}': this.valueOrDash(
          shipment.status || order.fulfillment_status,
        ),
        '#{carrier}': this.valueOrDash(shipment.carrier),
        '#{tracking_no}': this.valueOrDash(shipment.tracking_no),
        '#{tracking_url}': this.valueOrDash(shipment.tracking_url),
        '#{shipped_at}': this.formatDateTime(shipment.shipped_at),
      };
    }

    if (input.event === 'SHIPMENT_DELIVERED') {
      return {
        ...base,
        '#{fulfillment_status}': this.valueOrDash(
          shipment.status || order.fulfillment_status,
        ),
        '#{delivered_at}': this.formatDateTime(shipment.delivered_at),
      };
    }

    return base;
  }

  private resolveCustomerName(order: any): string | null {
    return (
      this.pickText(order?.customer_snapshot, [
        'name',
        'full_name',
        'customer_name',
      ]) ||
      this.pickText(order?.shipping_address_snapshot, [
        'recipient_name',
        'receiver_name',
        'name',
      ])
    );
  }

  private pickText(
    target: Record<string, unknown> | null | undefined,
    keys: string[],
  ): string | null {
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      return null;
    }

    for (const key of keys) {
      const value = target[key];
      if (typeof value !== 'string') {
        continue;
      }
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }

    return null;
  }

  private normalizePhone(value: string | null): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.replace(/[\s-]/g, '');
    if (!/^\+?\d{8,15}$/.test(normalized)) {
      return null;
    }

    return normalized;
  }

  private formatKrw(value: unknown): string {
    const amount =
      typeof value === 'number' && Number.isFinite(value) ? value : null;
    if (amount === null) {
      return '-';
    }

    return `${new Intl.NumberFormat('ko-KR').format(amount)}원`;
  }

  private formatDateTime(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return '-';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return date.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      hour12: false,
    });
  }

  private valueOrDash(value: unknown): string {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : '-';
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return '-';
  }

  private resolveOrderRef(order: any): string {
    return this.valueOrDash(order?.order_no || order?.id);
  }

  private async persistNotificationLog(input: {
    input: CommerceNotificationContext;
    templateId: string | null;
    phone: string | null;
    variables: Record<string, string>;
    status: NotificationPersistStatus;
    requestId?: string | null;
    responsePayload?: unknown;
    errorMessage?: string | null;
    sentAt?: string | null;
  }): Promise<void> {
    if (this.notificationLogUnavailable) {
      return;
    }

    const orderId = this.resolveUuid(input.input.order?.id);
    if (!orderId) {
      this.logger.warn(
        `Skip v2_order_notifications log: invalid order id (order=${this.resolveOrderRef(
          input.input.order,
        )}).`,
      );
      return;
    }

    const shipmentId = this.resolveUuid(input.input.shipment?.id);
    const payload = {
      event: input.input.event,
      order_ref: this.resolveOrderRef(input.input.order),
      shipment_id: shipmentId,
    };

    const { error } = await this.supabase
      .from('v2_order_notifications')
      .insert({
        order_id: orderId,
        shipment_id: shipmentId,
        event_type: input.input.event,
        channel: 'KAKAO_ALIMTALK',
        provider: 'sendon',
        template_id: input.templateId,
        recipient_phone: input.phone,
        variables_json: input.variables || {},
        payload_json: payload,
        response_json: this.normalizeJsonObject(input.responsePayload),
        status: input.status,
        provider_request_id: input.requestId || null,
        error_message: this.normalizeOptionalText(input.errorMessage),
        sent_at: input.sentAt ?? null,
        metadata: {
          source: 'CommerceNotificationsService',
        },
      });

    if (!error) {
      return;
    }

    if ((error as { code?: string }).code === '42P01') {
      this.notificationLogUnavailable = true;
      this.logger.warn(
        'v2_order_notifications table is missing. Notification logging is disabled until schema is applied.',
      );
      return;
    }

    this.logger.warn(
      `Failed to write v2_order_notifications (order=${this.resolveOrderRef(
        input.input.order,
      )}, event=${input.input.event}): ${
        (error as { message?: string }).message || 'unknown error'
      }`,
    );
  }

  private resolveUuid(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        trimmed,
      )
    ) {
      return null;
    }
    return trimmed;
  }

  private normalizeOptionalText(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeJsonObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }
}
