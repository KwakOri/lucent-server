import { Injectable, Logger } from '@nestjs/common';
import { SendonAlimtalkPayload, SendonAlimtalkResult, SendonGateway } from '../sendon.types';

@Injectable()
export class SendonMockGateway implements SendonGateway {
  private readonly logger = new Logger(SendonMockGateway.name);

  async sendAlimtalk(payload: SendonAlimtalkPayload): Promise<SendonAlimtalkResult> {
    const requestId = `mock-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;

    this.logger.log(
      `Mock alimtalk accepted (requestId=${requestId}, templateId=${payload.templateId}, recipient=${payload.recipientPhone})`,
    );

    return {
      provider: 'sendon',
      status: 'accepted',
      requestId,
      raw: {
        mode: 'mock',
      },
    };
  }
}
