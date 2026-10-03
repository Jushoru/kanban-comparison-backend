import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    let status = 500;
    let message: string | string[] = 'Internal server error';
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      if (status < 500) {
        const body = exception.getResponse();
        message = typeof body === 'string' ? body : (body as { message: string | string[] }).message;
      } else if (status === 503) {
        message = 'Database is unavailable';
      }
    } else if (exception && typeof exception === 'object' && 'code' in exception) {
      const code = exception.code;
      if (['23505', '23503', '40001', '40P01', '55P03'].includes(String(code))) {
        status = 409;
        message = 'Conflicting change; reload the board and retry';
      } else if (code === '23514' || code === '22001' || code === '22003') {
        status = 400;
        message = 'A value violates database constraints';
      }
    }
    if (status >= 500) {
      this.logger.error(`Request failed with status ${status}`);
    }
    host.switchToHttp().getResponse<Response>().status(status).json({
      statusCode: status, message, timestamp: new Date().toISOString(),
    });
  }
}
