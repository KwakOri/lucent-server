import { Module } from '@nestjs/common';
import { AddressModule } from './address/address.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ArtistsModule } from './artists/artists.module';
import { AppConfigModule } from './config/app-config.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProfilesModule } from './profiles/profiles.module';
import { ProductsModule } from './products/products.module';
import { ProjectsModule } from './projects/projects.module';
import { SendonModule } from './sendon/sendon.module';

@Module({
  imports: [
    AppConfigModule,
    SendonModule,
    NotificationsModule,
    ProductsModule,
    ProjectsModule,
    ArtistsModule,
    AddressModule,
    AuthModule,
    ProfilesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
