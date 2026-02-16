import { HttpException } from '@nestjs/common';

export class ApiException extends HttpException {
  constructor(message: string, statusCode = 500, errorCode = 'INTERNAL_ERROR') {
    super(
      {
        message,
        errorCode,
      },
      statusCode,
    );
  }
}
