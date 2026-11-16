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

  /**
   * Customer: List own reviews with pagination and filters.
   * Placed before :id to prevent route shadowing.
   * GET /reviews/my
   */
  @SkipThrottle()
  @Roles(UserRole.CUSTOMER)
  @Get('my')
  findMyReviews(
    @CurrentUser('id') userId: string,
    @Query() query: ReviewQueryDto,
  ) {
    return this.reviewService.findMyReviews(userId, query);
  }

  /**
   * Public: List approved latest reviews for a product with rating summary & 1-5 breakdown.
   * Placed before :id to prevent route shadowing.
   * GET /reviews/product/:productId
   */
  @SkipThrottle()
  @Public()
  @Get('product/:productId')
  findProductReviews(
    @Param('productId', new ParseUUIDPipe({ version: '4' })) productId: string,
    @Query() query: ReviewQueryDto,
  ) {
    return this.reviewService.findProductReviews(productId, query);
  }

  /**
   * Customer: Submit a verified-purchase review for an order item from a DELIVERED order.
   * POST /reviews
   */
  @Throttle(RATE_LIMITS.REVIEW)
  @Roles(UserRole.CUSTOMER)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReviewDto) {
    return this.reviewService.create(user, dto);
  }

  /**
   * Customer: Get own review detail by UUID.
   * GET /reviews/:id
   */
  @SkipThrottle()
  @Roles(UserRole.CUSTOMER)
  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.reviewService.findCustomerOne(id, userId);
  }

  /**
   * Customer: Update own review (resets status to PENDING for re-moderation).
   * PATCH /reviews/:id
   */
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

  /**
   * Customer: Delete own review.
   * DELETE /reviews/:id
   */
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

  /**
   * Customer: Upload images for own review (max 5 images, magic bytes verified).
   * POST /reviews/:id/images
   */
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

  /**
   * Customer: Delete an image from own review.
   * DELETE /reviews/:id/images/:imageId
   */
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
