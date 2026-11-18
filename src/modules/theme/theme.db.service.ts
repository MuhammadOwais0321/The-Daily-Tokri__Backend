import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ThemeSettings } from '@prisma/client';
import { DatabaseService } from '../../database/database.service';
import { THEME_SETTINGS_ID } from './types';

@Injectable()
export class ThemeDbService {
  private readonly logger = new Logger(ThemeDbService.name);

  constructor(private readonly db: DatabaseService) {}

  /** Fetches the singleton theme settings row, or `null` if not yet initialized. */
  async findSingleton(): Promise<ThemeSettings | null> {
    try {
      return await this.db.themeSettings.findUnique({
        where: { id: THEME_SETTINGS_ID },
      });
    } catch (error) {
      this.handlePrismaError(error, 'fetch theme settings');
    }
  }

  /** Atomically creates or updates the singleton theme settings row. */
  async upsertSingleton(activeTheme: string): Promise<ThemeSettings> {
    try {
      return await this.db.themeSettings.upsert({
        where: { id: THEME_SETTINGS_ID },
        create: {
          id: THEME_SETTINGS_ID,
          activeTheme,
        },
        update: {
          activeTheme,
        },
      });
    } catch (error) {
      this.handlePrismaError(error, 'update theme settings');
    }
  }

  private handlePrismaError(error: unknown, action: string): never {
    this.logger.error(
      `Failed to ${action}: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error.stack : undefined,
    );
    throw new InternalServerErrorException(`Failed to ${action}`);
  }
}
