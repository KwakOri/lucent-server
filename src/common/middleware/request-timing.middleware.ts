import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('RequestTiming');

function formatDurationMs(durationMs: number): string {
  return Math.max(0, durationMs).toFixed(1);
}

function shouldLogRequestTiming(): boolean {
  return (
    process.env.NODE_ENV !== 'production' ||
    process.env.LUCENT_API_TIMING_LOG === 'true'
  );
}

function appendServerTimingHeader(response: Response, value: string): void {
  const currentValue = response.getHeader('server-timing');
  if (!currentValue) {
    response.setHeader('server-timing', value);
    return;
  }

  const currentText = Array.isArray(currentValue)
    ? currentValue.join(', ')
    : String(currentValue);
  response.setHeader('server-timing', `${currentText}, ${value}`);
}

function setTimingHeaders(response: Response, durationMs: number): void {
  if (response.headersSent) {
    return;
  }

  const formattedDurationMs = formatDurationMs(durationMs);
  response.setHeader('x-lucent-backend-app-ms', formattedDurationMs);
  appendServerTimingHeader(
    response,
    `lucent_backend_app;dur=${formattedDurationMs}`,
  );
}

export function requestTimingMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const startedAt = performance.now();
  const originalWriteHead = response.writeHead;

  response.writeHead = function writeHeadWithTiming(...args) {
    setTimingHeaders(response, performance.now() - startedAt);
    return originalWriteHead.apply(this, args);
  };

  response.on('finish', () => {
    if (!shouldLogRequestTiming()) {
      return;
    }

    logger.log(
      [
        request.method,
        request.originalUrl || request.url,
        `status=${response.statusCode}`,
        `duration=${formatDurationMs(performance.now() - startedAt)}ms`,
      ].join(' '),
    );
  });

  next();
}
