export interface SendonAlimtalkRecipient {
  phone: string;
  variables?: Record<string, string>;
}

export interface SendonAlimtalkReservation {
  dateTime: string | null;
}

export type SendonAlimtalkFallbackType = 'NONE' | 'TEMPLATE' | 'CUSTOM';
export type SendonAlimtalkFallbackCustomType = 'SMS' | 'LMS' | 'MMS';

export interface SendonAlimtalkFallbackCustom {
  type: SendonAlimtalkFallbackCustomType;
  senderNumber: string;
  isAd?: boolean;
  message: string;
  title?: string;
  images?: string[];
}

export interface SendonAlimtalkFallback {
  fallbackType?: SendonAlimtalkFallbackType;
  custom?: SendonAlimtalkFallbackCustom;
}

export interface SendonAlimtalkPayload {
  sendProfileId: string;
  templateId: string;
  to: Array<string | SendonAlimtalkRecipient>;
  reservation?: SendonAlimtalkReservation;
  useCredit?: boolean;
  fallback?: SendonAlimtalkFallback;
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
