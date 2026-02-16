import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminOrdersController } from './admin-orders.controller';
import { DownloadController } from './download.controller';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { UserOrdersController } from './user-orders.controller';

@Module({
  imports: [AuthModule],
  controllers: [
    OrdersController,
    AdminOrdersController,
    UserOrdersController,
    DownloadController,
  ],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
