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
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { CurrentUser, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { ImageValidationPipe } from '../../common/pipes';
import { RATE_LIMITS } from '../../config/rate-limit.config';
import { BrandService } from './brand.service';
import { BrandQueryDto, CreateBrandDto, UpdateBrandDto } from './dto';
import 'multer';

@Roles(UserRole.ADMIN)
@Controller('admin/brands')
export class BrandController {
  constructor(private readonly brandService: BrandService) {}

  /** List all brands with pagination and filters. */
  @SkipThrottle()
  @Get()
  findAll(@Query() query: BrandQueryDto) {
    return this.brandService.findAll(query);
  }

  /** Get brand detail by UUID. */
  @SkipThrottle()
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.brandService.findOne(id);
  }

  /** Create a new brand. */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() createBrandDto: CreateBrandDto,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.brandService.create(createBrandDto, adminId);
  }

  /** Update brand name or active status. */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() updateBrandDto: UpdateBrandDto,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.brandService.update(id, updateBrandDto, adminId);
  }

  /** Delete brand (blocked with 409 if products are linked). */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.brandService.remove(id, adminId);
  }

  /** Upload or replace brand logo in S3. */
  @Throttle(RATE_LIMITS.ADMIN_IMAGE_UPLOAD)
  @Post(':id/logo')
  @UseInterceptors(FileInterceptor('logo'))
  uploadLogo(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @UploadedFile(new ImageValidationPipe()) file: Express.Multer.File,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.brandService.uploadLogo(id, file, adminId);
  }

  /** Delete brand logo from S3 and database. */
  @Throttle(RATE_LIMITS.ADMIN_WRITE)
  @Delete(':id/logo')
  deleteLogo(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.brandService.deleteLogo(id, adminId);
  }
}
