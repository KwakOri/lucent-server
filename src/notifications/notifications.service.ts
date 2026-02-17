import { BadRequestException, Injectable } from '@nestjs/common';
import { SendonService } from '../sendon/sendon.service';
import { SendAlimtalkDto } from './dto/send-alimtalk.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly sendonService: SendonService) {}

  async sendKakaoAlimtalk(dto: SendAlimtalkDto) {
    const normalizedRecipient = this.normalizeAndValidatePhone(dto.recipientPhone);
    const templateCode = this.requireNonEmpty(
      dto.templateId ?? dto.templateCode ?? '',
      'templateId',
    );
    const message = this.requireNonEmpty(dto.message, 'message');

    return this.sendonService.sendAlimtalk({
      recipientPhone: normalizedRecipient,
      templateCode,
      message,
      templateVariables: dto.templateVariables,
    });
  }

  private requireNonEmpty(value: string, fieldName: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${fieldName} is required.`);
    }

    return value.trim();
  }

  private normalizeAndValidatePhone(phone: string): string {
    if (typeof phone !== 'string' || phone.trim().length === 0) {
      throw new BadRequestException('recipientPhone is required.');
    }

    const normalized = phone.replace(/[\s-]/g, '');
    if (!/^\+?\d{8,15}$/.test(normalized)) {
      throw new BadRequestException('recipientPhone format is invalid.');
    }

    return normalized;
  }
}
