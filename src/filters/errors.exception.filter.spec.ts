import {
  HttpException,
  HttpStatus,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { Response } from 'express';
import {
  PrismaClientKnownRequestError,
  PrismaClientValidationError,
  PrismaClientInitializationError,
} from '@prisma/client/runtime/client';
import { ErrorsExceptionFilter } from './errors.exception.filter';

describe('ErrorsExceptionFilter', () => {
  let filter: ErrorsExceptionFilter;
  let mockResponse: Partial<Response>;
  let mockHost: ArgumentsHost;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;
  let loggerErrorSpy: jest.SpyInstance;

  function expectNoStackTrace(): void {
    const calls = jsonMock.mock.calls as Array<[Record<string, unknown>]>;
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0]).toBeDefined();
    expect(lastCall[0].stack).toBeUndefined();
  }

  beforeEach(() => {
    filter = new ErrorsExceptionFilter();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });

    mockResponse = {
      headersSent: false,
      status: statusMock,
      json: jsonMock,
    };

    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse as Response,
        getRequest: () => ({}),
        getNext: () => ({}),
      }),
    } as unknown as ArgumentsHost;

    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('HttpException handling', () => {
    it('should format standard NestJS HttpException object response correctly', () => {
      const exception = new BadRequestException('Invalid input field');

      filter.catch(exception, mockHost);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(jsonMock).toHaveBeenCalledWith({
        statusCode: 400,
        message: 'Invalid input field',
        error: 'Bad Request',
      });
      expect(loggerErrorSpy).not.toHaveBeenCalled();
    });

    it('should format validation pipe errors (array of messages)', () => {
      const validationMessages = [
        'name must not be empty',
        'email must be a valid email',
      ];
      const exception = new BadRequestException(validationMessages);

      filter.catch(exception, mockHost);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(jsonMock).toHaveBeenCalledWith({
        statusCode: 400,
        message: validationMessages,
        error: 'Bad Request',
      });
    });

    it('should format string-based HttpException', () => {
      const exception = new HttpException(
        'Access Denied',
        HttpStatus.FORBIDDEN,
      );

      filter.catch(exception, mockHost);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(jsonMock).toHaveBeenCalledWith({
        statusCode: 403,
        message: 'Access Denied',
        error: 'Forbidden',
      });
    });

    it('should log 500 HttpExceptions in server log', () => {
      const exception = new InternalServerErrorException(
        'Something went wrong on server',
      );

      filter.catch(exception, mockHost);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(jsonMock).toHaveBeenCalledWith({
        statusCode: 500,
        message: 'Something went wrong on server',
        error: 'Internal Server Error',
      });
      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  describe('Prisma error handling', () => {
    it('P2002 (unique) -> 409 Unique constraint violation', () => {
      const exception = new PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`email`)',
        { code: 'P2002', clientVersion: '7.10.1' },
      );

      filter.catch(exception, mockHost);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(jsonMock).toHaveBeenCalledWith({
        statusCode: 409,
        message: 'Unique constraint violation',
        error: 'Conflict',
      });
      expectNoStackTrace();
    });

    it('P2003 (foreign key) -> 400 Invalid foreign key reference', () => {
      const exception = new PrismaClientKnownRequestError(
        'Foreign key constraint failed on the field: (`categoryId`)',
        { code: 'P2003', clientVersion: '7.10.1' },
      );

      filter.catch(exception, mockHost);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(jsonMock).toHaveBeenCalledWith({
        statusCode: 400,
        message: 'Invalid foreign key reference',
        error: 'Bad Request',
      });
      expectNoStackTrace();
    });

    it('P2025 (not found) -> 404 Record not found', () => {
      const exception = new PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found.',
        { code: 'P2025', clientVersion: '7.10.1' },
      );

      filter.catch(exception, mockHost);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(jsonMock).toHaveBeenCalledWith({
        statusCode: 404,
        message: 'Record not found',
        error: 'Not Found',
      });
      expectNoStackTrace();
    });

    it('Other Prisma KnownRequestError (e.g. P2010) -> 500 Database error occurred and logged', () => {
      const exception = new PrismaClientKnownRequestError(
        'Raw query failed. Code: `42P01`. Message: `relation does not exist`',
        { code: 'P2010', clientVersion: '7.10.1' },
      );

      filter.catch(exception, mockHost);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(jsonMock).toHaveBeenCalledWith({
        statusCode: 500,
        message: 'Database error occurred',
        error: 'Internal Server Error',
      });
      expectNoStackTrace();
      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('Prisma validation error -> 400 Invalid data provided', () => {
      const exception = new PrismaClientValidationError(
        'Invalid argument `foo` provided.',
        {
          clientVersion: '7.10.1',
        },
      );

      filter.catch(exception, mockHost);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(jsonMock).toHaveBeenCalledWith({
        statusCode: 400,
        message: 'Invalid data provided',
        error: 'Bad Request',
      });
      expectNoStackTrace();
    });

    it('Other Prisma DB errors (e.g. PrismaClientInitializationError) -> 500 Database error occurred and logged', () => {
      const exception = new PrismaClientInitializationError(
        'Can not reach database server at `localhost:5432`',
        '7.10.1',
      );

      filter.catch(exception, mockHost);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(jsonMock).toHaveBeenCalledWith({
        statusCode: 500,
        message: 'Database error occurred',
        error: 'Internal Server Error',
      });
      expectNoStackTrace();
      expect(loggerErrorSpy).toHaveBeenCalled();
    });
  });

  describe('Generic unhandled errors', () => {
    it('baaki unhandled errors -> 500 Internal Server Error, no stack trace in response, logged in server log', () => {
      const exception = new Error(
        'Unexpected NullPointerException or system error',
      );

      filter.catch(exception, mockHost);

      expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(jsonMock).toHaveBeenCalledWith({
        statusCode: 500,
        message: 'Internal Server Error',
        error: 'Internal Server Error',
      });
      expectNoStackTrace();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unhandled internal server error'),
        expect.any(String),
      );
    });
  });

  describe('Headers sent check', () => {
    it('should not call response.status or json if headers have already been sent', () => {
      mockResponse.headersSent = true;
      const exception = new Error('Too late');

      filter.catch(exception, mockHost);

      expect(statusMock).not.toHaveBeenCalled();
      expect(jsonMock).not.toHaveBeenCalled();
    });
  });
});
