import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { validateEnvironment } from '../src/config/env.validation';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('fails startup when JWT_SECRET is missing from environment', () => {
    const originalEnv = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    try {
      expect(() => {
        validateEnvironment({ ...process.env, JWT_SECRET: undefined });
      }).toThrow(
        /Environment validation failed.*JWT_SECRET is required and cannot be empty/,
      );
    } finally {
      process.env.JWT_SECRET = originalEnv;
    }
  });

  afterEach(async () => {
    await app.close();
  });
});
