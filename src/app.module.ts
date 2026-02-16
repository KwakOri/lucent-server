import { Module } from '@nestjs/common';
import { AddressModule } from './address/address.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ArtistsModule } from './artists/artists.module';
import { CartModule } from './cart/cart.module';
import { AppConfigModule } from './config/app-config.module';
import { LogsModule } from './logs/logs.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { ProfilesModule } from './profiles/profiles.module';
import { ProductsModule } from './products/products.module';
import { ProjectsModule } from './projects/projects.module';
import { SendonModule } from './sendon/sendon.module';

@Module({
  imports: [
    AppConfigModule,
    SendonModule,
    NotificationsModule,
    LogsModule,
    OrdersModule,
    ProductsModule,
    ProjectsModule,
    ArtistsModule,
    AddressModule,
    AuthModule,
    CartModule,
    ProfilesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
