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
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  UpdateProductDto,
  ListProductsQueryDto,
  UpdateProductImageDto,
  CreateProductAllergenDto,
} from './dto';
import { Roles, CurrentUser } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { ImageValidationPipe } from '../../common/pipes';
import 'multer';

@Roles(UserRole.ADMIN)
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * Admin: List all products (includes inactive/invisible products)
   */
  @Get()
  findAll(@Query() query: ListProductsQueryDto) {
    return this.productsService.findAll(query, false);
  }

  /**
   * Admin: Product detail by UUID (accessible even if inactive)
   */
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.productsService.findOne(id, false);
  }

  /**
   * Admin: Create product
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() createProductDto: CreateProductDto,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.productsService.create(createProductDto, adminId);
  }

  /**
   * Admin: Update product details
   */
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() updateProductDto: UpdateProductDto,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.productsService.update(id, updateProductDto, adminId);
  }

  /**
   * Admin: Delete product
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.productsService.remove(id, adminId);
  }

  // --- Product Images ---

  /**
   * Admin: Upload product images (max 3 per product)
   */
  @Post(':id/images')
  @UseInterceptors(FilesInterceptor('images', 3))
  uploadImages(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @UploadedFiles(new ImageValidationPipe()) files: Express.Multer.File[],
    @Query('isPrimaryIndex') isPrimaryIndex?: string,
    @CurrentUser('id') adminId?: string,
  ) {
    const primaryIdx = isPrimaryIndex !== undefined ? Number(isPrimaryIndex) : 0;
    return this.productsService.uploadImages(id, files, primaryIdx, adminId);
  }

  /**
   * Admin: Update image metadata (altText, sortOrder, isPrimary)
   */
  @Patch(':id/images/:imageId')
  updateImage(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('imageId', new ParseUUIDPipe({ version: '4' })) imageId: string,
    @Body() dto: UpdateProductImageDto,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.productsService.updateImage(id, imageId, dto, adminId);
  }

  /**
   * Admin: Delete product image
   */
  @Delete(':id/images/:imageId')
  deleteImage(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('imageId', new ParseUUIDPipe({ version: '4' })) imageId: string,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.productsService.deleteImage(id, imageId, adminId);
  }

  // --- Product Allergens ---

  /**
   * Admin: List allergens for product
   */
  @Get(':id/allergens')
  getAllergens(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.productsService.findAllergens(id);
  }

  /**
   * Admin: Declare allergen for product
   */
  @Post(':id/allergens')
  @HttpCode(HttpStatus.CREATED)
  addAllergen(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreateProductAllergenDto,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.productsService.addAllergen(id, dto, adminId);
  }

  /**
   * Admin: Remove allergen declaration
   */
  @Delete(':id/allergens/:allergenId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAllergen(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Param('allergenId', new ParseUUIDPipe({ version: '4' }))
    allergenId: string,
    @CurrentUser('id') adminId?: string,
  ) {
    return this.productsService.deleteAllergen(id, allergenId, adminId);
  }
}
