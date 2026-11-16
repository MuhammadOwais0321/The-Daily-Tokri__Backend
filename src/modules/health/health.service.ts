import { Injectable } from '@nestjs/common';
import { IHealthResponse } from './types';

@Injectable()
export class HealthService {
  /** Returns lightweight liveness status and process uptime. */
  check(): IHealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
