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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { CategoryService } from './category.service';
import { CreateCategoryDto, UpdateCategoryDto, CategoryQueryDto } from './dto';
import { Roles, CurrentUser } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { ImageValidationPipe } from '../../common/pipes';
import { RATE_LIMITS } from '../../config/rate-limit.config';
import 'multer';

@Roles(UserRole.ADMIN)
@Controller('admin/categories')
export class AdminCategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  /** Full category hierarchy tree */
  @Get('tree')
  getTree(@Query('onlyActive') onlyActive?: string) {
    const activeOnly = onlyActive === 'true';
    return this.categoryService.findAll(
      { tree: true, isActive: activeOnly ? true : undefined },
      false,
    );
  }

  /** List all categories with pagination */
  @Get()
  findAll(@Query() query: CategoryQueryDto) {
    return this.categoryService.findAll(query, false);
  }

  /** Category detail */
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.categoryService.findOne(id, false);
  }

  /** Create category */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() createCategoryDto: CreateCategoryDto,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.categoryService.create(createCategoryDto, adminId);
  }

  /** Update category & re-parenting */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.categoryService.update(id, updateCategoryDto, adminId);
  }

  /** Delete category */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.categoryService.remove(id, adminId);
  }

  /** Upload category image to S3 */
  @Throttle(RATE_LIMITS.ADMIN_IMAGE_UPLOAD)
  @Post(':id/image')
  @UseInterceptors(FileInterceptor('image'))
  uploadImage(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @UploadedFile(new ImageValidationPipe()) file: Express.Multer.File,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.categoryService.uploadImage(id, file, adminId);
  }

  /** Delete category image from S3 */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Delete(':id/image')
  deleteImage(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.categoryService.deleteImage(id, adminId);
  }
}
