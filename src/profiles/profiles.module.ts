import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SendonModule } from '../sendon/sendon.module';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

@Module({
  imports: [AuthModule, SendonModule],
  controllers: [ProfilesController],
  providers: [ProfilesService],
})
export class ProfilesModule {}
