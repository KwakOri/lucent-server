import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { V2CatalogModule } from '../v2-catalog/v2-catalog.module';
import { V2CheckoutController } from './v2-checkout.controller';
import { V2CheckoutService } from './v2-checkout.service';

@Module({
  imports: [AuthModule, V2CatalogModule],
  controllers: [V2CheckoutController],
  providers: [V2CheckoutService],
})
export class V2CheckoutModule {}
