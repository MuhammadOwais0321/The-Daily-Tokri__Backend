import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CategoryQueryDto } from './dto';
import { Public } from '../../common/decorators';

@Public()
@Controller('categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  /** Public category hierarchy tree (active categories only). */
  @Get('tree')
  getTree() {
    return this.categoryService.findAll({ tree: true }, true);
  }

  /** Lookup category by slug (declared before `:id` to prevent route shadowing). */
  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.categoryService.findBySlug(slug, true);
  }

  /** Public catalog category list (active categories only). */
  @Get()
  findAll(@Query() query: CategoryQueryDto) {
    return this.categoryService.findAll(query, true);
  }

  /** Public category detail by UUID. */
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.categoryService.findOne(id, true);
  }
}
