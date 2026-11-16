import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { RATE_LIMITS } from '../../config/rate-limit.config';
import {
  ListUsersQueryDto,
  UpdateUserPreferencesDto,
  UpdateUserProfileDto,
  UpdateUserStatusDto,
} from './dto';
import { UserService } from './user.service';

@Throttle(RATE_LIMITS.USER)
@Roles(UserRole.CUSTOMER, UserRole.ADMIN)
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /** Returns the current authenticated user's profile. */
  @SkipThrottle()
  @Get('me')
  getMe(@CurrentUser('id') userId: string) {
    return this.userService.getProfile(userId);
  }

  /** Returns the current authenticated user's order and rating statistics. */
  @SkipThrottle()
  @Get('me/stats')
  getMyStats(@CurrentUser('id') userId: string) {
    return this.userService.getStats(userId);
  }

  /** Returns the current user's notification preferences. */
  @SkipThrottle()
  @Get('preferences')
  getPreferences(@CurrentUser('id') userId: string) {
    return this.userService.getPreferences(userId);
  }

  /** Upserts notification preferences (`pushNotification`, `emailNotification`). */
  @Put('preferences')
  upsertPreferences(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserPreferencesDto,
  ) {
    return this.userService.upsertPreferences(userId, dto);
  }

  /** Lists users for admin view (declared before `:id` routes to prevent route shadowing). */
  @SkipThrottle()
  @Roles(UserRole.ADMIN)
  @Get('list')
  findAll(@Query() query: ListUsersQueryDto) {
    return this.userService.findAll(query);
  }

  /** Updates the authenticated user's profile (`name`, `phone`). */
  @Put()
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserProfileDto,
  ) {
    return this.userService.updateProfile(userId, dto);
  }

  /** Customer self-delete (anonymizes account in an atomic transaction). */
  @Roles(UserRole.CUSTOMER)
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAccount(@CurrentUser('id') userId: string) {
    return this.userService.deleteAccount(userId);
  }

  /** Activates or deactivates a customer account. */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Roles(UserRole.ADMIN)
  @Patch(':id/status')
  updateStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.userService.updateStatus(id, adminId, dto);
  }
}
