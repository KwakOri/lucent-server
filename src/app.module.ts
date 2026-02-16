import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/app-config.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SendonModule } from './sendon/sendon.module';

@Module({
  imports: [AppConfigModule, SendonModule, NotificationsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
