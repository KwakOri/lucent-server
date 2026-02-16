import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { successResponse } from '../common/api-response';
import { AuthService } from './auth.service';

interface SendVerificationBody {
  email?: string;
  password?: string;
}

interface VerifyCodeBody {
  email?: string;
  code?: string;
}

interface SignupBody {
  email?: string;
  verificationToken?: string;
}

interface LoginBody {
  email?: string;
  password?: string;
}

interface ResetPasswordBody {
  email?: string;
}

interface UpdatePasswordBody {
  token?: string;
  newPassword?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('send-verification')
  @HttpCode(200)
  async sendVerification(@Body() body: SendVerificationBody) {
    const result = await this.authService.sendVerification(
      body.email || '',
      body.password || '',
    );
    return successResponse(result, '인증 코드가 이메일로 발송되었습니다');
  }

  @Post('verify-code')
  @HttpCode(200)
  async verifyCode(@Body() body: VerifyCodeBody) {
    const token = await this.authService.verifyCode(
      body.email || '',
      body.code || '',
    );
    return successResponse({ token }, '이메일 인증이 완료되었습니다');
  }

  @Get('verify-email')
  async verifyEmail(
    @Query('token') token: string | undefined,
    @Res() response: Response,
  ) {
    if (!token) {
      return response.redirect(
        this.authService.getVerificationErrorRedirect(
          'no_token',
          '인증 토큰이 없습니다. 다시 시도해주세요.',
        ),
      );
    }

    try {
      await this.authService.verifyEmailToken(token);
      return response.redirect(
        this.authService.getVerificationSuccessRedirect(token),
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : '인증 링크가 유효하지 않습니다.';
      return response.redirect(
        this.authService.getVerificationErrorRedirect('invalid_token', message),
      );
    }
  }

  @Post('signup')
  async signup(@Body() body: SignupBody) {
    const result = await this.authService.signupWithVerification(
      body.email,
      body.verificationToken || '',
    );
    return successResponse(result, '회원가입이 완료되었습니다!');
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginBody) {
    const result = await this.authService.login(
      body.email || '',
      body.password || '',
    );
    return successResponse(result);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Headers('authorization') authorization?: string) {
    await this.authService.logout(authorization);
    return successResponse({ message: '로그아웃되었습니다' });
  }

  @Post('oauth/profile-sync')
  @HttpCode(200)
  async syncOAuthProfile(@Headers('authorization') authorization?: string) {
    const result = await this.authService.syncOAuthProfile(authorization);
    return successResponse(result);
  }

  @Get('session')
  async getSession(@Headers('authorization') authorization?: string) {
    const result = await this.authService.getSession(authorization);
    return successResponse(result);
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() body: ResetPasswordBody) {
    await this.authService.requestPasswordReset(body.email || '');
    return successResponse({
      message: '비밀번호 재설정 이메일이 발송되었습니다.',
    });
  }

  @Post('update-password')
  @HttpCode(200)
  async updatePassword(@Body() body: UpdatePasswordBody) {
    const result = await this.authService.updatePassword(
      body.token || '',
      body.newPassword || '',
    );
    return successResponse({
      ...result,
      message: '비밀번호가 성공적으로 변경되었습니다.',
    });
  }
}
