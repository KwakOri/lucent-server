import {
  SendonAlimtalkFallback,
  SendonAlimtalkRecipient,
  SendonAlimtalkReservation,
} from '../../sendon/sendon.types';

export class SendAlimtalkDto {
  sendProfileId?: string;
  templateId: string;
  to: Array<string | SendonAlimtalkRecipient>;
  reservation?: SendonAlimtalkReservation;
  useCredit?: boolean;
  fallback?: SendonAlimtalkFallback;
}
