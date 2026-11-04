import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { ProductsDbService } from './products.db.service';
import { CategoryService } from '../category/category.service';
import { AuditService } from '../audit/audit.service';
import { S3Service } from '../../common/services/s3.service';

describe('ProductsService', () => {
  let service: ProductsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: ProductsDbService, useValue: {} },
        { provide: CategoryService, useValue: {} },
        { provide: AuditService, useValue: {} },
        { provide: S3Service, useValue: {} },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
