import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { V2CheckoutModule } from '../v2-checkout/v2-checkout.module';
import { V2FulfillmentModule } from '../v2-fulfillment/v2-fulfillment.module';
import { V2AdminActionExecutorService } from './v2-admin-action-executor.service';
import { V2AdminBatchService } from './v2-admin-batch.service';
import { V2AdminController } from './v2-admin.controller';
import { V2AdminOrderTransitionService } from './v2-admin-order-transition.service';
import { V2AdminService } from './v2-admin.service';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => V2FulfillmentModule),
    forwardRef(() => V2CheckoutModule),
  ],
  controllers: [V2AdminController],
  providers: [
    V2AdminService,
    V2AdminActionExecutorService,
    V2AdminOrderTransitionService,
    V2AdminBatchService,
  ],
  exports: [V2AdminActionExecutorService],
})
export class V2AdminModule {}
