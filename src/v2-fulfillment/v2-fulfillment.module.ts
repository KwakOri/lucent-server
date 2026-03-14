import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { V2FulfillmentController } from './v2-fulfillment.controller';
import { V2FulfillmentService } from './v2-fulfillment.service';

@Module({
  imports: [AuthModule],
  controllers: [V2FulfillmentController],
  providers: [V2FulfillmentService],
})
export class V2FulfillmentModule {}
