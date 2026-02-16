import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const normalized = this.normalizeExceptionResponse(exceptionResponse, status);
      response.status(status).json(normalized);
      return;
    }

    if (exception instanceof Error) {
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        status: 'error',
        message: exception.message || 'Internal server error',
        errorCode: 'INTERNAL_ERROR',
      });
      return;
    }

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      status: 'error',
      message: 'Unknown error occurred',
      errorCode: 'UNKNOWN_ERROR',
    });
  }

  private normalizeExceptionResponse(exceptionResponse: string | object, status: number) {
    if (typeof exceptionResponse === 'string') {
      return {
        status: 'error',
        message: exceptionResponse,
        errorCode: this.defaultErrorCodeByStatus(status),
      };
    }

    const payload = exceptionResponse as Record<string, unknown>;
    const message = this.extractMessage(payload.message);
    const errorCode = (payload.errorCode as string) || this.defaultErrorCodeByStatus(status);

    return {
      status: 'error',
      message,
      errorCode,
    };
  }

  private extractMessage(raw: unknown): string {
    if (Array.isArray(raw) && raw.length > 0) {
      return String(raw[0]);
    }
    if (typeof raw === 'string') {
      return raw;
    }
    return 'Request failed';
  }

  private defaultErrorCodeByStatus(status: number): string {
    if (status >= 500) {
      return 'INTERNAL_ERROR';
    }
    if (status === HttpStatus.UNAUTHORIZED) {
      return 'UNAUTHENTICATED';
    }
    if (status === HttpStatus.FORBIDDEN) {
      return 'UNAUTHORIZED';
    }
    if (status === HttpStatus.NOT_FOUND) {
      return 'NOT_FOUND';
    }
    if (status === HttpStatus.BAD_REQUEST) {
      return 'VALIDATION_ERROR';
    }
    return 'REQUEST_FAILED';
  }
}
