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
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { CurrentUser, Public, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { ImageValidationPipe } from '../../common/pipes';
import { RATE_LIMITS } from '../../config/rate-limit.config';
import type { AuthUser } from '../auth/types';
import { CreateReviewDto, ReviewQueryDto, UpdateReviewDto } from './dto';
import { MAX_REVIEW_IMAGES, ReviewService } from './review.service';
import 'multer';

@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  /** List customer's own reviews (declared before `:id` to prevent route shadowing). */
  @SkipThrottle()
  @Roles(UserRole.CUSTOMER)
  @Get('my')
  findMyReviews(
    @CurrentUser('id') userId: string,
    @Query() query: ReviewQueryDto,
  ) {
    return this.reviewService.findMyReviews(userId, query);
  }

  /** Public approved latest reviews for a product with rating summary (declared before `:id`). */
  @SkipThrottle()
  @Public()
  @Get('product/:productId')
  findProductReviews(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @Query() query: ReviewQueryDto,
  ) {
    return this.reviewService.findProductReviews(productId, query);
  }

  /** Submit a verified-purchase review for an item from a `DELIVERED` order. */
  @Throttle(RATE_LIMITS.REVIEW)
  @Roles(UserRole.CUSTOMER)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReviewDto) {
    return this.reviewService.create(user, dto);
  }

  /** Get customer's own review detail by UUID. */
  @SkipThrottle()
  @Roles(UserRole.CUSTOMER)
  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.reviewService.findCustomerOne(id, userId);
  }

  /** Update customer's own review (resets status to `PENDING` for re-moderation). */
  @Throttle(RATE_LIMITS.REVIEW)
  @Roles(UserRole.CUSTOMER)
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviewService.update(id, user, dto);
  }

  /** Delete customer's own review. */
  @Throttle(RATE_LIMITS.REVIEW)
  @Roles(UserRole.CUSTOMER)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reviewService.removeCustomerReview(id, user);
  }

  /** Upload images for customer's own review (max 5 images). */
  @Throttle(RATE_LIMITS.REVIEW)
  @Roles(UserRole.CUSTOMER)
  @Post(':id/images')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor('images', MAX_REVIEW_IMAGES))
  uploadImages(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFiles(new ImageValidationPipe()) files: Express.Multer.File[],
  ) {
    return this.reviewService.uploadImages(id, user, files);
  }

  /** Delete an image from customer's own review. */
  @Throttle(RATE_LIMITS.REVIEW)
  @Roles(UserRole.CUSTOMER)
  @Delete(':id/images/:imageId')
  deleteImage(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('imageId', new ParseUUIDPipe({ version: '4' })) imageId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reviewService.deleteImage(id, imageId, user);
  }
}
