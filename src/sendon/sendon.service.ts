import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { SENDON_GATEWAY } from './sendon.constants';
import {
  SendonAlimtalkPayload,
  SendonAlimtalkResult,
  SendonGateway,
} from './sendon.types';

@Injectable()
export class SendonService {
  private readonly logger = new Logger(SendonService.name);

  constructor(
    private readonly configService: AppConfigService,
    @Inject(SENDON_GATEWAY) private readonly gateway: SendonGateway,
  ) {}

  async sendAlimtalk(
    payload: SendonAlimtalkPayload,
  ): Promise<SendonAlimtalkResult> {
    if (!this.configService.sendon.enabled) {
      this.logger.warn('Sendon delivery is disabled by SENDON_ENABLED=false.');
      return {
        provider: 'sendon',
        status: 'disabled',
        requestId: null,
      };
    }

    try {
      return await this.gateway.sendAlimtalk(payload);
    } catch (error) {
      this.logger.error(
        'Sendon alimtalk delivery failed.',
        error instanceof Error ? error.stack : undefined,
      );
      return {
        provider: 'sendon',
        status: 'failed',
        requestId: null,
        raw: {
          reason: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}
