import { Body, Controller, Patch } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { RATE_LIMITS } from '../../config/rate-limit.config';
import { UpdateThemeDto } from './dto';
import { ThemeService } from './theme.service';
import type { IThemeResponse } from './types';

@Roles(UserRole.ADMIN)
@Controller('admin/theme')
export class AdminThemeController {
  constructor(private readonly themeService: ThemeService) {}

  /** Admin endpoint to update the active frontend theme. */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Patch()
  updateActiveTheme(
    @Body() dto: UpdateThemeDto,
    @CurrentUser('id') adminId?: string,
  ): Promise<IThemeResponse> {
    return this.themeService.updateActiveTheme(dto, adminId);
  }
}
