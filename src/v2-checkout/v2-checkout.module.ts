import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { V2AdminModule } from '../v2-admin/v2-admin.module';
import { V2CatalogModule } from '../v2-catalog/v2-catalog.module';
import { V2CheckoutController } from './v2-checkout.controller';
import { V2CheckoutService } from './v2-checkout.service';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    V2CatalogModule,
    forwardRef(() => V2AdminModule),
  ],
  controllers: [V2CheckoutController],
  providers: [V2CheckoutService],
  exports: [V2CheckoutService],
})
export class V2CheckoutModule {}
