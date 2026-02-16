import { Injectable } from '@nestjs/common';
import { AppRuntimeConfig } from './app-config.types';

@Injectable()
export class AppConfigService {
  private readonly config: AppRuntimeConfig = this.load();

  get port(): number {
    return this.config.port;
  }

  get corsOrigins(): string[] {
    return this.config.corsOrigins;
  }

  get sendon() {
    return this.config.sendon;
  }

  private load(): AppRuntimeConfig {
    return {
      port: this.readNumber('PORT', 3000),
      corsOrigins: this.readCsv('CORS_ORIGINS'),
      sendon: {
        enabled: this.readBoolean('SENDON_ENABLED', true),
        mock: this.readBoolean('SENDON_MOCK', true),
        apiKey: this.readString('SENDON_API_KEY', ''),
        apiSecret: this.readString('SENDON_API_SECRET', ''),
        senderKey: this.readString('SENDON_SENDER_KEY', ''),
        baseUrl: this.readString('SENDON_BASE_URL', ''),
        sdkPackage: this.readString('SENDON_SDK_PACKAGE', '@sendon/sdk'),
        sdkClientFactory: this.readString('SENDON_SDK_CLIENT_FACTORY', 'createClient'),
        sdkClientClass: this.readString('SENDON_SDK_CLIENT_CLASS', 'SendonClient'),
        sdkSendMethod: this.readString('SENDON_SDK_SEND_METHOD', 'sendAlimtalk'),
      },
    };
  }

  private readString(key: string, fallback = ''): string {
    const value = process.env[key];
    if (value === undefined) {
      return fallback;
    }

    return value.trim();
  }

  private readNumber(key: string, fallback: number): number {
    const value = process.env[key];
    if (!value) {
      return fallback;
    }

    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      return fallback;
    }

    return parsed;
  }

  private readBoolean(key: string, fallback: boolean): boolean {
    const value = process.env[key];
    if (!value) {
      return fallback;
    }

    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
      return false;
    }

    return fallback;
  }

  private readCsv(key: string): string[] {
    const value = process.env[key];
    if (!value) {
      return [];
    }

    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
