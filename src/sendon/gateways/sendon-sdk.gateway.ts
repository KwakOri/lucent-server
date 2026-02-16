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
    const methodName = this.configService.sendon.sdkSendMethod;
    const sendMethod = client?.[methodName];

    if (typeof sendMethod !== 'function') {
      throw new Error(
        `Sendon SDK method "${methodName}" was not found. Check SENDON_SDK_SEND_METHOD in environment variables.`,
      );
    }

    const request = {
      to: payload.recipientPhone,
      templateCode: payload.templateCode,
      message: payload.message,
      variables: payload.templateVariables ?? {},
      senderKey: this.configService.sendon.senderKey,
    };

    const raw = await sendMethod.call(client, request);

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
    if (!config.apiKey || !config.apiSecret) {
      throw new Error('SENDON_API_KEY and SENDON_API_SECRET are required when SENDON_MOCK=false.');
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

    const clientOptions = {
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      baseUrl: config.baseUrl || undefined,
    };

    this.sdkClient = this.createClientFromModule(sdkModule, clientOptions, config.sdkClientFactory, config.sdkClientClass);
    this.logger.log(`Sendon SDK client initialized from package "${config.sdkPackage}".`);

    return this.sdkClient;
  }

  private createClientFromModule(
    sdkModule: any,
    clientOptions: Record<string, unknown>,
    factoryName: string,
    className: string,
  ) {
    const moduleDefault = sdkModule?.default;
    const factory =
      sdkModule?.[factoryName] ||
      moduleDefault?.[factoryName] ||
      (typeof sdkModule?.createClient === 'function' ? sdkModule.createClient : undefined) ||
      (typeof moduleDefault?.createClient === 'function' ? moduleDefault.createClient : undefined);

    if (typeof factory === 'function') {
      return factory(clientOptions);
    }

    const ClientClass = sdkModule?.[className] || moduleDefault?.[className];
    if (typeof ClientClass === 'function') {
      return new ClientClass(clientOptions);
    }

    if (moduleDefault && typeof moduleDefault === 'function') {
      return new moduleDefault(clientOptions);
    }

    throw new Error(
      `Could not initialize Sendon SDK client. Check SENDON_SDK_CLIENT_FACTORY ("${factoryName}") and SENDON_SDK_CLIENT_CLASS ("${className}").`,
    );
  }

  private resolveRequestId(raw: any): string | null {
    if (!raw) {
      return null;
    }

    return raw.requestId || raw.messageId || raw.id || null;
  }
}
