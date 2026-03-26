export interface SendonTemplateRuntimeConfig {
  orderPlaced: string;
  paymentCaptured: string;
  shipmentDispatched: string;
  shipmentDelivered: string;
  phoneVerification: string;
}

export interface SendonRuntimeConfig {
  enabled: boolean;
  mock: boolean;
  accountId: string;
  apiKey: string;
  defaultSendProfileId: string;
  sdkPackage: string;
  commerceNotifyEnabled: boolean;
  templates: SendonTemplateRuntimeConfig;
}

export interface AppRuntimeConfig {
  port: number;
  corsOrigins: string[];
  sendon: SendonRuntimeConfig;
}
