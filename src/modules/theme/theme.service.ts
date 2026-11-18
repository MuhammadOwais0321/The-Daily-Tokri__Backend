import { Injectable, Logger } from '@nestjs/common';
import { AuditActorType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { UpdateThemeDto } from './dto';
import { toThemeResponse } from './mappers';
import { ThemeDbService } from './theme.db.service';
import { DEFAULT_THEME, IThemeResponse, THEME_SETTINGS_ID } from './types';

@Injectable()
export class ThemeService {
  private readonly logger = new Logger(ThemeService.name);

  constructor(
    private readonly themeDb: ThemeDbService,
    private readonly auditService: AuditService,
  ) {}

  private logAudit(
    action: string,
    entityId: string,
    adminId: string | undefined,
    details: Record<string, unknown>,
  ): void {
    this.auditService
      .log({
        entityType: 'THEME',
        entityId,
        action,
        actorType: AuditActorType.ADMIN,
        actorId: adminId,
        details,
      })
      .catch((err) => {
        this.logger.error(
          `Failed to log ${action} audit event: ${(err as Error).message}`,
        );
      });
  }

  /** Returns the currently active theme (falls back to `"default"` if not yet persisted). */
  async getActiveTheme(): Promise<IThemeResponse> {
    const settings = await this.themeDb.findSingleton();
    return toThemeResponse(settings);
  }

  /** Atomically updates the singleton active theme and logs an admin audit event. */
  async updateActiveTheme(
    dto: UpdateThemeDto,
    adminId?: string,
  ): Promise<IThemeResponse> {
    const existing = await this.themeDb.findSingleton();
    const previousTheme = existing?.activeTheme ?? DEFAULT_THEME;

    const updated = await this.themeDb.upsertSingleton(dto.activeTheme);

    this.logger.log(
      `Active theme updated from "${previousTheme}" to "${updated.activeTheme}"`,
    );

    this.logAudit('UPDATE_THEME', THEME_SETTINGS_ID, adminId, {
      previousTheme,
      activeTheme: updated.activeTheme,
    });

    return toThemeResponse(updated);
  }
}
