import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { SendonAlimtalkPayload, SendonAlimtalkResult, SendonGateway } from '../sendon.types';

@Injectable()
export class SendonSdkGateway implements SendonGateway {
  private readonly logger = new Logger(SendonSdkGateway.name);
  private sdkClient: any;

  constructor(private readonly configService: AppConfigService) {}

  async sendAlimtalk(payload: SendonAlimtalkPayload): Promise<SendonAlimtalkResult> {
    const client = await this.getClient();
    const sendMethod = client?.kakao?.sendAlimTalk;

    if (typeof sendMethod !== 'function') {
      throw new Error(
        'Sendon SDK method "kakao.sendAlimTalk" was not found. Check SDK package/version.',
      );
    }

    const request: Record<string, unknown> = {
      phone: payload.recipientPhone,
      templateId: payload.templateId,
      message: payload.message,
    };

    const variables = this.resolveVariables(payload.templateVariables);
    if (variables.length > 0) {
      request.variables = variables;
    }

    const raw = await sendMethod.call(client.kakao, request);

    return {
      provider: 'sendon',
      status: 'accepted',
      requestId: this.resolveRequestId(raw),
      raw,
    };
  }

  private async getClient() {
    if (this.sdkClient) {
      return this.sdkClient;
    }

    const config = this.configService.sendon;
    if (!config.accountId || !config.apiKey) {
      throw new Error(
        'SENDON_ID and SENDON_API_KEY are required when SENDON_MOCK=false.',
      );
    }

    let sdkModule: any;
    try {
      sdkModule = await import(config.sdkPackage);
    } catch (error) {
      this.logger.error(
        `Failed to import Sendon SDK package "${config.sdkPackage}". Install the package and check SENDON_SDK_PACKAGE.`,
      );
      throw error;
    }

    const clientOptions: Record<string, unknown> = {
      id: config.accountId,
      apikey: config.apiKey,
    };
    if (config.baseUrl) {
      clientOptions.baseUrl = config.baseUrl;
    }

    this.sdkClient = this.createClientFromModule(sdkModule, clientOptions);
    this.logger.log(`Sendon SDK client initialized from package "${config.sdkPackage}".`);

    return this.sdkClient;
  }

  private createClientFromModule(sdkModule: any, clientOptions: Record<string, unknown>) {
    const constructors = [
      sdkModule?.Sendon,
      sdkModule?.default?.Sendon,
      sdkModule?.default,
    ];

    for (const Ctor of constructors) {
      if (typeof Ctor === 'function') {
        return new Ctor(clientOptions);
      }
    }

    throw new Error(
      'Could not initialize Sendon SDK client. Expected "Sendon" export from SDK package.',
    );
  }

  private resolveVariables(
    input: SendonAlimtalkPayload['templateVariables'],
  ): Array<string | number> {
    if (!input) {
      return [];
    }

    if (Array.isArray(input)) {
      return input;
    }

    return Object.values(input);
  }

  private resolveRequestId(raw: any): string | null {
    if (!raw) {
      return null;
    }

    return (
      raw.requestId ||
      raw.messageId ||
      raw.id ||
      raw?.data?.requestId ||
      raw?.data?.messageId ||
      null
    );
  }
}
