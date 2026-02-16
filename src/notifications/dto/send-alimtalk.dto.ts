import { AlimtalkTemplateVariables } from '../../sendon/sendon.types';

export class SendAlimtalkDto {
  recipientPhone: string;
  templateCode: string;
  message: string;
  templateVariables?: AlimtalkTemplateVariables;
}
