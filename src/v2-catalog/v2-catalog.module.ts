import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { V2CatalogController } from './v2-catalog.controller';
import { V2CatalogService } from './v2-catalog.service';

@Module({
  imports: [AuthModule],
  controllers: [V2CatalogController],
  providers: [V2CatalogService],
})
export class V2CatalogModule {}

