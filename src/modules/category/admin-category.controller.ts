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
import { CategoryService } from './category.service';
import { CreateCategoryDto, UpdateCategoryDto, CategoryQueryDto } from './dto';
import { Roles, CurrentUser } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { ImageValidationPipe } from '../../common/pipes';
import 'multer';

@Roles(UserRole.ADMIN)
@Controller('admin/categories')
export class AdminCategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  /**
   * Admin category tree (includes inactive categories by default)
   * Placed before :id to prevent route shadowing
   */
  @Get('tree')
  getTree(@Query('onlyActive') onlyActive?: string) {
    const activeOnly = onlyActive === 'true';
    return this.categoryService.findAll(
      { tree: true, isActive: activeOnly ? true : undefined },
      false,
    );
  }

  /**
   * Admin category list (includes inactive categories by default)
   */
  @Get()
  findAll(@Query() query: CategoryQueryDto) {
    return this.categoryService.findAll(query, false);
  }

  /**
   * Admin category detail (accessible even if category is inactive)
   */
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.categoryService.findOne(id, false);
  }

  /**
   * Admin: Create category
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() createCategoryDto: CreateCategoryDto,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.categoryService.create(createCategoryDto, adminId);
  }

  /**
   * Admin: Update category & re-parenting
   */
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.categoryService.update(id, updateCategoryDto, adminId);
  }

  /**
   * Admin: Delete category
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.categoryService.remove(id, adminId);
  }

  /**
   * Admin: Upload category image to S3 (Pattern 2)
   */
  @Post(':id/image')
  @UseInterceptors(FileInterceptor('image'))
  uploadImage(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @UploadedFile(new ImageValidationPipe()) file: Express.Multer.File,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.categoryService.uploadImage(id, file, adminId);
  }

  /**
   * Admin: Delete category image from S3
   */
  @Delete(':id/image')
  deleteImage(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.categoryService.deleteImage(id, adminId);
  }
}
