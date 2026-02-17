import { BadRequestException, Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { SendonService } from '../sendon/sendon.service';
import {
  SendonAlimtalkFallback,
  SendonAlimtalkRecipient,
  SendonAlimtalkReservation,
} from '../sendon/sendon.types';
import { SendAlimtalkDto } from './dto/send-alimtalk.dto';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly sendonService: SendonService,
    private readonly configService: AppConfigService,
  ) {}

  async sendKakaoAlimtalk(dto: SendAlimtalkDto) {
    const sendProfileId = this.resolveSendProfileId(dto.sendProfileId);
    const templateId = this.requireNonEmpty(dto.templateId, 'templateId');
    const to = this.normalizeRecipients(dto.to);
    const reservation = this.normalizeReservation(dto.reservation);
    const useCredit = this.normalizeUseCredit(dto.useCredit);
    const fallback = this.normalizeFallback(dto.fallback);

    return this.sendonService.sendAlimtalk({
      sendProfileId,
      templateId,
      to,
      reservation,
      useCredit,
      fallback,
    });
  }

  private resolveSendProfileId(sendProfileId?: string): string {
    const requestValue = typeof sendProfileId === 'string' ? sendProfileId.trim() : '';
    if (requestValue) {
      return requestValue;
    }

    const envValue = this.configService.sendon.defaultSendProfileId.trim();
    if (envValue) {
      return envValue;
    }

    throw new BadRequestException(
      'sendProfileId is required. Provide it in request body or set SENDON_SEND_PROFILE_ID.',
    );
  }

  private requireNonEmpty(value: string, fieldName: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${fieldName} is required.`);
    }

    return value.trim();
  }

  private normalizeRecipients(
    recipients: Array<string | SendonAlimtalkRecipient>,
  ): Array<string | SendonAlimtalkRecipient> {
    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new BadRequestException('to must be a non-empty array.');
    }

    return recipients.map((recipient) => {
      if (typeof recipient === 'string') {
        return this.normalizeAndValidatePhone(recipient, 'to');
      }

      if (!recipient || typeof recipient !== 'object' || Array.isArray(recipient)) {
        throw new BadRequestException('Each recipient in "to" must be a string or object.');
      }

      const phone = this.normalizeAndValidatePhone(recipient.phone, 'to[].phone');
      const variables = this.normalizeVariables(recipient.variables);

      if (variables) {
        return {
          phone,
          variables,
        };
      }

      return {
        phone,
      };
    });
  }

  private normalizeVariables(
    variables: unknown,
  ): Record<string, string> | undefined {
    if (variables === undefined || variables === null) {
      return undefined;
    }

    if (typeof variables !== 'object' || Array.isArray(variables)) {
      throw new BadRequestException('to[].variables must be an object.');
    }

    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(variables)) {
      if (key.trim().length === 0) {
        throw new BadRequestException('to[].variables keys must be non-empty strings.');
      }

      if (value === null || value === undefined) {
        throw new BadRequestException(`to[].variables.${key} must not be null.`);
      }

      normalized[key] = String(value);
    }

    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

  private normalizeReservation(
    reservation: SendonAlimtalkReservation | undefined,
  ): SendonAlimtalkReservation | undefined {
    if (reservation === undefined) {
      return undefined;
    }

    if (
      typeof reservation !== 'object' ||
      reservation === null ||
      Array.isArray(reservation)
    ) {
      throw new BadRequestException('reservation must be an object.');
    }

    const { dateTime } = reservation;
    if (dateTime === null) {
      return { dateTime: null };
    }

    if (typeof dateTime !== 'string' || dateTime.trim().length === 0) {
      throw new BadRequestException('reservation.dateTime must be string or null.');
    }

    return { dateTime: dateTime.trim() };
  }

  private normalizeUseCredit(useCredit: unknown): boolean | undefined {
    if (useCredit === undefined) {
      return undefined;
    }

    if (typeof useCredit !== 'boolean') {
      throw new BadRequestException('useCredit must be a boolean.');
    }

    return useCredit;
  }

  private normalizeFallback(
    fallback: SendonAlimtalkFallback | undefined,
  ): SendonAlimtalkFallback | undefined {
    if (fallback === undefined) {
      return undefined;
    }

    if (
      typeof fallback !== 'object' ||
      fallback === null ||
      Array.isArray(fallback)
    ) {
      throw new BadRequestException('fallback must be an object.');
    }

    return fallback;
  }

  private normalizeAndValidatePhone(phone: string, fieldName: string): string {
    if (typeof phone !== 'string' || phone.trim().length === 0) {
      throw new BadRequestException(`${fieldName} is required.`);
    }

    const normalized = phone.replace(/[\s-]/g, '');
    if (!/^\+?\d{8,15}$/.test(normalized)) {
      throw new BadRequestException(`${fieldName} format is invalid.`);
    }

    return normalized;
  }
}
