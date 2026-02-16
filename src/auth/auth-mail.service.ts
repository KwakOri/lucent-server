import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ApiException } from '../common/errors/api.exception';

interface VerificationEmailParams {
  email: string;
  code: string;
  token: string;
}

@Injectable()
export class AuthMailService {
  async sendVerificationEmail(params: VerificationEmailParams): Promise<void> {
    const transporter = this.createTransporter();
    const verificationUrl = `${this.getFrontendAppUrl()}/auth/verify-email?token=${params.token}`;

    try {
      await transporter.sendMail({
        from: this.getFromAddress(),
        to: params.email,
        subject: '[Lucent Management] 이메일 인증',
        html: this.verificationTemplate(params.code, verificationUrl),
      });
    } catch {
      throw new ApiException(
        '이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.',
        500,
        'EMAIL_SEND_FAILED',
      );
    }
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const transporter = this.createTransporter();
    const resetUrl = `${this.getFrontendAppUrl()}/auth/reset-password?token=${token}`;

    try {
      await transporter.sendMail({
        from: this.getFromAddress(),
        to: email,
        subject: '[Lucent Management] 비밀번호 재설정',
        html: this.passwordResetTemplate(resetUrl),
      });
    } catch {
      throw new ApiException(
        '이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.',
        500,
        'EMAIL_SEND_FAILED',
      );
    }
  }

  private createTransporter() {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number.parseInt(process.env.SMTP_PORT || '587', 10);
    const secure =
      (process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!user || !pass) {
      throw new ApiException(
        'SMTP 설정이 필요합니다',
        500,
        'SMTP_NOT_CONFIGURED',
      );
    }

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });
  }

  private getFromAddress(): string {
    const smtpFrom = process.env.SMTP_FROM || process.env.SMTP_USER;
    if (!smtpFrom) {
      throw new ApiException(
        'SMTP 발신자 주소가 설정되지 않았습니다',
        500,
        'SMTP_FROM_MISSING',
      );
    }

    return `"Lucent Management" <${smtpFrom}>`;
  }

  private getFrontendAppUrl(): string {
    return (
      process.env.FRONTEND_APP_URL ||
      process.env.APP_URL ||
      'http://localhost:3000'
    );
  }

  private verificationTemplate(code: string, verificationUrl: string): string {
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height:1.5; color:#111827;">
        <h2>Lucent Management 이메일 인증</h2>
        <p>아래 인증 코드를 입력해 회원가입을 완료해주세요.</p>
        <p style="font-size:32px; font-weight:700; letter-spacing:6px;">${code}</p>
        <p>또는 아래 링크를 클릭해 인증할 수 있습니다.</p>
        <p><a href="${verificationUrl}">${verificationUrl}</a></p>
        <p>인증 코드는 10분 동안 유효합니다.</p>
      </div>
    `;
  }

  private passwordResetTemplate(resetUrl: string): string {
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height:1.5; color:#111827;">
        <h2>Lucent Management 비밀번호 재설정</h2>
        <p>아래 링크를 눌러 비밀번호를 재설정해주세요.</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>링크는 10분 동안 유효합니다.</p>
      </div>
    `;
  }
}
