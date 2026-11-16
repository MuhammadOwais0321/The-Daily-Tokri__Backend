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

  /**
   * Current authenticated user profile.
   * GET /user/me
   */
  @SkipThrottle()
  @Get('me')
  getMe(@CurrentUser('id') userId: string) {
    return this.userService.getProfile(userId);
  }

  /**
   * Current authenticated user stats (totalOrders, totalSpent, avgRating).
   * GET /user/me/stats
   */
  @SkipThrottle()
  @Get('me/stats')
  getMyStats(@CurrentUser('id') userId: string) {
    return this.userService.getStats(userId);
  }

  /**
   * Get current user's notification preferences.
   * GET /user/preferences
   */
  @SkipThrottle()
  @Get('preferences')
  getPreferences(@CurrentUser('id') userId: string) {
    return this.userService.getPreferences(userId);
  }

  /**
   * Upsert notification preferences (push/email toggles).
   * PUT /user/preferences
   */
  @Put('preferences')
  upsertPreferences(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserPreferencesDto,
  ) {
    return this.userService.upsertPreferences(userId, dto);
  }

  /**
   * Admin: List users with search, role, isActive, and includeDeleted filters.
   * Placed before :id routes to prevent route shadowing.
   * GET /user/list
   */
  @SkipThrottle()
  @Roles(UserRole.ADMIN)
  @Get('list')
  findAll(@Query() query: ListUsersQueryDto) {
    return this.userService.findAll(query);
  }

  /**
   * Update authenticated user's profile (name, phone).
   * PUT /user
   */
  @Put()
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserProfileDto,
  ) {
    return this.userService.updateProfile(userId, dto);
  }

  /**
   * Customer self-delete (anonymizes account in an atomic transaction).
   * DELETE /user
   */
  @Roles(UserRole.CUSTOMER)
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAccount(@CurrentUser('id') userId: string) {
    return this.userService.deleteAccount(userId);
  }

  /**
   * Admin: Activate or deactivate a customer account (self -> 400, admin target -> 403).
   * PATCH /user/:id/status
   */
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
