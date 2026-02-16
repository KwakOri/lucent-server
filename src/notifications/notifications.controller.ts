import { Body, Controller, Post } from '@nestjs/common';
import { SendAlimtalkDto } from './dto/send-alimtalk.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('kakao/alimtalk')
  sendKakaoAlimtalk(@Body() body: SendAlimtalkDto) {
    return this.notificationsService.sendKakaoAlimtalk(body);
  }
}
