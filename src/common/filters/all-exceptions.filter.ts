import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

const DEFAULT_ERROR_CODE = 'INTERNAL_ERROR';

/**
 * Normalizes every thrown error to `{ message, code }` on the wire and logs
 * the full detail server-side, so a non-HttpException (or an HttpException
 * whose body isn't already `{message, code}`-shaped) never leaks internals
 * to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const { message, code } = this.resolveBody(exception, status);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        exception instanceof Error ? exception.stack : exception,
      );
    }

    response.status(status).json({ message, code });
  }

  private resolveBody(
    exception: unknown,
    status: number,
  ): { message: string; code: string } {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();

      if (typeof body === 'string') {
        return { message: body, code: this.codeFromStatus(status) };
      }

      if (this.isRecord(body)) {
        const message = this.extractMessage(body.message) ?? exception.message;
        const code =
          typeof body.code === 'string'
            ? body.code
            : this.codeFromStatus(status);
        return { message, code };
      }

      return { message: exception.message, code: this.codeFromStatus(status) };
    }

    return {
      message: 'An unexpected error occurred. Please try again later.',
      code: DEFAULT_ERROR_CODE,
    };
  }

  private extractMessage(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.join(', ');
    return undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private codeFromStatus(status: number): string {
    return HttpStatus[status] ?? DEFAULT_ERROR_CODE;
  }
}
