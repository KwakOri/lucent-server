import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { V2ContentController } from './v2-content.controller';
import { V2ContentService } from './v2-content.service';

@Module({
  imports: [AuthModule],
  controllers: [V2ContentController],
  providers: [V2ContentService],
  exports: [V2ContentService],
})
export class V2ContentModule {}
