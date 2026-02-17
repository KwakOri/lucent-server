export interface SendonRuntimeConfig {
  enabled: boolean;
  mock: boolean;
  accountId: string;
  apiKey: string;
  defaultSendProfileId: string;
  sdkPackage: string;
}

export interface AppRuntimeConfig {
  port: number;
  corsOrigins: string[];
  sendon: SendonRuntimeConfig;
}
