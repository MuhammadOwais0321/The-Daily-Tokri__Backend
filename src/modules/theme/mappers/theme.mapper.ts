import { ThemeSettings } from '@prisma/client';
import { DEFAULT_THEME, IThemeResponse } from '../types';

/** Maps the singleton `ThemeSettings` record (or `null`) to the public API response. */
export function toThemeResponse(
  settings: Pick<ThemeSettings, 'activeTheme'> | null,
): IThemeResponse {
  return {
    activeTheme: settings?.activeTheme ?? DEFAULT_THEME,
  };
}
