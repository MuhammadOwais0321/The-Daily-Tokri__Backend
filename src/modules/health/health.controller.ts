import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { HealthService } from './health.service';
import type { IHealthResponse } from './types';

@SkipThrottle()
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Public liveness check endpoint.
   * GET /health
   */
  @Get()
  check(): IHealthResponse {
    return this.healthService.check();
  }
}
