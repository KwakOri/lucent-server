export interface AlimtalkTemplateVariables {
  [key: string]: string | number;
}

export interface SendonAlimtalkPayload {
  recipientPhone: string;
  templateCode: string;
  message: string;
  templateVariables?: AlimtalkTemplateVariables | Array<string | number>;
}

export interface SendonAlimtalkResult {
  provider: 'sendon';
  status: 'accepted' | 'disabled' | 'failed';
  requestId: string | null;
  raw?: unknown;
}

export interface SendonGateway {
  sendAlimtalk(payload: SendonAlimtalkPayload): Promise<SendonAlimtalkResult>;
}
