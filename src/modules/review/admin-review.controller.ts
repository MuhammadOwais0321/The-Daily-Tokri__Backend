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
  Query,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { RATE_LIMITS } from '../../config/rate-limit.config';
import type { AuthUser } from '../auth/types';
import { AdminReplyReviewDto, ModerateReviewDto, ReviewQueryDto } from './dto';
import { ReviewService } from './review.service';

@Roles(UserRole.ADMIN)
@Controller('admin/reviews')
export class AdminReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  /**
   * Admin: List all reviews with moderation filters and pagination.
   * GET /admin/reviews
   */
  @SkipThrottle()
  @Get()
  findAll(@Query() query: ReviewQueryDto) {
    return this.reviewService.findAdminAll(query);
  }

  /**
   * Admin: Get single review detail by UUID.
   * GET /admin/reviews/:id
   */
  @SkipThrottle()
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.reviewService.findAdminOne(id);
  }

  /**
   * Admin: Moderate review status (APPROVED / REJECTED).
   * PATCH /admin/reviews/:id/status
   */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Patch(':id/status')
  moderateStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() admin: AuthUser,
    @Body() dto: ModerateReviewDto,
  ) {
    return this.reviewService.moderateStatus(id, admin, dto);
  }

  /**
   * Admin: Add or update reply on a review (max 500 chars).
   * PATCH /admin/reviews/:id/reply
   */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Patch(':id/reply')
  reply(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() admin: AuthUser,
    @Body() dto: AdminReplyReviewDto,
  ) {
    return this.reviewService.replyToReview(id, admin, dto);
  }

  /**
   * Admin: Delete reply on a review (idempotent).
   * DELETE /admin/reviews/:id/reply
   */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Delete(':id/reply')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeReply(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.reviewService.removeAdminReply(id, admin);
  }

  /**
   * Admin: Delete any review.
   * DELETE /admin/reviews/:id
   */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.reviewService.removeAdminReview(id, admin);
  }
}
