import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators';
import { ThemeService } from './theme.service';
import type { IThemeResponse } from './types';

@Public()
@Controller('theme')
export class ThemeController {
  constructor(private readonly themeService: ThemeService) {}

  /** Public endpoint returning the active frontend theme identifier. */
  @Get()
  getActiveTheme(): Promise<IThemeResponse> {
    return this.themeService.getActiveTheme();
  }
}
