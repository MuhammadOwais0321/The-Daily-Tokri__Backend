import { Injectable } from '@nestjs/common';
import { IHealthResponse } from './types';

@Injectable()
export class HealthService {
  /**
   * Lightweight liveness probe (Docs 01 §22.8, 02 §2.2, api-reference.md).
   */
  check(): IHealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
