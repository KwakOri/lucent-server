import { Module } from '@nestjs/common';
import { AddressModule } from './address/address.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ArtistsModule } from './artists/artists.module';
import { CartModule } from './cart/cart.module';
import { AppConfigModule } from './config/app-config.module';
import { ImagesModule } from './images/images.module';
import { LogsModule } from './logs/logs.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProfilesModule } from './profiles/profiles.module';
import { ProductsModule } from './products/products.module';
import { ProjectsModule } from './projects/projects.module';
import { SendonModule } from './sendon/sendon.module';
import { V2AdminModule } from './v2-admin/v2-admin.module';
import { V2CatalogModule } from './v2-catalog/v2-catalog.module';
import { V2CheckoutModule } from './v2-checkout/v2-checkout.module';
import { V2FulfillmentModule } from './v2-fulfillment/v2-fulfillment.module';

@Module({
  imports: [
    AppConfigModule,
    SendonModule,
    NotificationsModule,
    ImagesModule,
    LogsModule,
    ProductsModule,
    ProjectsModule,
    ArtistsModule,
    AddressModule,
    AuthModule,
    CartModule,
    ProfilesModule,
    V2AdminModule,
    V2CatalogModule,
    V2CheckoutModule,
    V2FulfillmentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
