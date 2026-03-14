import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { V2AdminModule } from '../v2-admin/v2-admin.module';
import { V2FulfillmentController } from './v2-fulfillment.controller';
import { V2FulfillmentService } from './v2-fulfillment.service';

@Module({
  imports: [AuthModule, V2AdminModule],
  controllers: [V2FulfillmentController],
  providers: [V2FulfillmentService],
})
export class V2FulfillmentModule {}
