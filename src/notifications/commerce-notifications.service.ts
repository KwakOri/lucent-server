import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { SendonService } from '../sendon/sendon.service';
import { SendonAlimtalkRecipient } from '../sendon/sendon.types';

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

@Injectable()
export class CommerceNotificationsService {
  private readonly logger = new Logger(CommerceNotificationsService.name);

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
    if (!this.configService.sendon.commerceNotifyEnabled) {
      return;
    }

    const sendProfileId = this.configService.sendon.defaultSendProfileId.trim();
    if (!sendProfileId) {
      this.logger.warn(
        `Skip ${input.event}: SENDON_SEND_PROFILE_ID is empty.`,
      );
      return;
    }

    const templateId = this.resolveTemplateId(input.event);
    if (!templateId) {
      this.logger.warn(
        `Skip ${input.event}: template id is empty. Set corresponding SENDON_TEMPLATE_* env.`,
      );
      return;
    }

    const phone = this.resolveRecipientPhone(input.order);
    if (!phone) {
      this.logger.warn(
        `Skip ${input.event}: recipient phone not found for order=${this.resolveOrderRef(input.order)}.`,
      );
      return;
    }

    const recipient: SendonAlimtalkRecipient = {
      phone,
      variables: this.buildVariables(input),
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
      return;
    }

    this.logger.log(
      `Sendon ${input.event} accepted (order=${this.resolveOrderRef(
        input.order,
      )}, requestId=${result.requestId ?? 'none'}).`,
    );
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

  private buildVariables(input: CommerceNotificationContext): Record<string, string> {
    const order = input.order || {};
    const shipment = input.shipment || {};
    const customerName = this.resolveCustomerName(order);

    const base = {
      '#{주문번호}': this.valueOrDash(order.order_no || order.id),
      '#{고객명}': this.valueOrDash(customerName),
      '#{주문상태}': this.valueOrDash(order.order_status),
      '#{결제상태}': this.valueOrDash(order.payment_status),
      '#{배송상태}': this.valueOrDash(order.fulfillment_status),
      '#{주문금액}': this.formatKrw(order.grand_total),
      '#{주문일시}': this.formatDateTime(order.placed_at),
    };

    if (input.event === 'PAYMENT_CAPTURED') {
      return {
        ...base,
        '#{결제금액}': this.formatKrw(order.grand_total),
        '#{결제일시}': this.formatDateTime(order.confirmed_at),
      };
    }

    if (input.event === 'SHIPMENT_DISPATCHED') {
      return {
        ...base,
        '#{배송상태}': this.valueOrDash(shipment.status || order.fulfillment_status),
        '#{택배사}': this.valueOrDash(shipment.carrier),
        '#{송장번호}': this.valueOrDash(shipment.tracking_no),
        '#{송장URL}': this.valueOrDash(shipment.tracking_url),
        '#{출고일시}': this.formatDateTime(shipment.shipped_at),
      };
    }

    if (input.event === 'SHIPMENT_DELIVERED') {
      return {
        ...base,
        '#{배송상태}': this.valueOrDash(shipment.status || order.fulfillment_status),
        '#{배송완료일시}': this.formatDateTime(shipment.delivered_at),
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
}
