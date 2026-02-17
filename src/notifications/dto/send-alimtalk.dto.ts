import { AlimtalkTemplateVariables } from '../../sendon/sendon.types';

export class SendAlimtalkDto {
  recipientPhone: string;
  templateCode?: string;
  templateId?: string;
  message: string;
  templateVariables?: AlimtalkTemplateVariables | Array<string | number>;
}
