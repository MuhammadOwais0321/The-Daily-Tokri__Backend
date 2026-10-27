import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { STATUS_CODES } from 'http';
import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
  PrismaClientInitializationError,
  PrismaClientRustPanicError,
  PrismaClientUnknownRequestError,
} from '@prisma/client/runtime/client';

export interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function getExceptionName(val: unknown): string | undefined {
  if (isRecord(val) && typeof val.name === 'string') {
    return val.name;
  }
  return undefined;
}

@Catch()
export class ErrorsExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorsExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (response.headersSent) {
      return;
    }

    // 1. NestJS HttpException handling -> standard { statusCode, message, error }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (status >= 500) {
        this.logger.error(
          `HttpException ${status}: ${exception.message}`,
          exception.stack,
        );
      }

      if (isRecord(exceptionResponse)) {
        const statusCode =
          typeof exceptionResponse.statusCode === 'number'
            ? exceptionResponse.statusCode
            : status;

        const message =
          typeof exceptionResponse.message === 'string' ||
          Array.isArray(exceptionResponse.message)
            ? (exceptionResponse.message as string | string[])
            : exception.message;

        const error =
          typeof exceptionResponse.error === 'string'
            ? exceptionResponse.error
            : (STATUS_CODES[statusCode] ?? 'Error');

        response.status(statusCode).json({
          statusCode,
          message,
          error,
        });
        return;
      }

      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : exception.message;
      const error = STATUS_CODES[status] ?? 'Error';

      response.status(status).json({
        statusCode: status,
        message,
        error,
      });
      return;
    }

    const exceptionName = getExceptionName(exception);

    // 2. Prisma Known Request Errors
    if (
      exception instanceof PrismaClientKnownRequestError ||
      exceptionName === 'PrismaClientKnownRequestError'
    ) {
      const prismaError = exception as PrismaClientKnownRequestError;

      switch (prismaError.code) {
        case 'P2002':
          response.status(HttpStatus.CONFLICT).json({
            statusCode: HttpStatus.CONFLICT,
            message: 'Unique constraint violation',
            error: 'Conflict',
          });
          return;

        case 'P2003':
          response.status(HttpStatus.BAD_REQUEST).json({
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Invalid foreign key reference',
            error: 'Bad Request',
          });
          return;

        case 'P2025':
          response.status(HttpStatus.NOT_FOUND).json({
            statusCode: HttpStatus.NOT_FOUND,
            message: 'Record not found',
            error: 'Not Found',
          });
          return;

        default:
          this.logger.error(
            `Prisma known request error [${prismaError.code}]: ${prismaError.message}`,
            prismaError.stack,
          );
          response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'Database error occurred',
            error: 'Internal Server Error',
          });
          return;
      }
    }

    // 3. Prisma Validation Error
    if (
      exception instanceof PrismaClientValidationError ||
      exceptionName === 'PrismaClientValidationError'
    ) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid data provided',
        error: 'Bad Request',
      });
      return;
    }

    // 4. Other Prisma database errors (initialization, rust panic, unknown, etc.)
    const isOtherPrismaError =
      exception instanceof PrismaClientInitializationError ||
      exception instanceof PrismaClientRustPanicError ||
      exception instanceof PrismaClientUnknownRequestError ||
      (typeof exceptionName === 'string' &&
        exceptionName.startsWith('PrismaClient'));

    if (isOtherPrismaError) {
      const err = exception as Error;
      this.logger.error(`Prisma database error: ${err.message}`, err.stack);
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Database error occurred',
        error: 'Internal Server Error',
      });
      return;
    }

    // 5. Baaki unhandled errors (500) -> Internal Server Error (stack only in server log)
    const err =
      exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(
      `Unhandled internal server error: ${err.message}`,
      err.stack,
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal Server Error',
      error: 'Internal Server Error',
    });
  }
}
