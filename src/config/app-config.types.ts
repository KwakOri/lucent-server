export interface SendonRuntimeConfig {
  enabled: boolean;
  mock: boolean;
  apiKey: string;
  apiSecret: string;
  senderKey: string;
  baseUrl: string;
  sdkPackage: string;
  sdkClientFactory: string;
  sdkClientClass: string;
  sdkSendMethod: string;
}

export interface AppRuntimeConfig {
  port: number;
  corsOrigins: string[];
  sendon: SendonRuntimeConfig;
}
