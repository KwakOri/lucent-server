import { Module } from '@nestjs/common';
import { SendonModule } from '../sendon/sendon.module';
import { CommerceNotificationsService } from './commerce-notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [SendonModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, CommerceNotificationsService],
  exports: [CommerceNotificationsService],
})
export class NotificationsModule {}
