import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { V2AdminActionExecutorService } from './v2-admin-action-executor.service';
import { V2AdminController } from './v2-admin.controller';
import { V2AdminService } from './v2-admin.service';

@Module({
  imports: [AuthModule],
  controllers: [V2AdminController],
  providers: [V2AdminService, V2AdminActionExecutorService],
  exports: [V2AdminActionExecutorService],
})
export class V2AdminModule {}
