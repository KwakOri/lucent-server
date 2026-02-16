import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthMailService } from './auth-mail.service';
import { AuthService } from './auth.service';
import { AuthSessionService } from './auth-session.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthMailService, AuthSessionService],
  exports: [AuthSessionService],
})
export class AuthModule {}
