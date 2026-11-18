import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database';
import { AuditModule } from '../audit/audit.module';
import { AdminThemeController } from './admin-theme.controller';
import { ThemeController } from './theme.controller';
import { ThemeDbService } from './theme.db.service';
import { ThemeService } from './theme.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [ThemeController, AdminThemeController],
  providers: [ThemeService, ThemeDbService],
  exports: [ThemeService, ThemeDbService],
})
export class ThemeModule {}
