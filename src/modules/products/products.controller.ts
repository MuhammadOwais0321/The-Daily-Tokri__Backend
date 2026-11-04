import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { ListProductsQueryDto } from './dto';
import { Public } from '../../common/decorators';

@Public()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * Static route: Lookup product by slug
   * Placed before :id to prevent route shadowing
   */
  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.productsService.findBySlug(slug, true);
  }

  /**
   * Public catalog product listing (active and visible products only)
   */
  @Get()
  findAll(@Query() query: ListProductsQueryDto) {
    return this.productsService.findAll(query, true);
  }

  /**
   * Public product detail by UUID (active and visible products only)
   */
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.productsService.findOne(id, true);
  }
}
