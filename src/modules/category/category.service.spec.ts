import { Test, TestingModule } from '@nestjs/testing';
import { CategoryService } from './category.service';
import { CategoryDbService } from './category.db.service';
import { S3Service } from '../../common/services/s3.service';
import { AuditService } from '../audit/audit.service';

describe('CategoryService', () => {
  let service: CategoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        {
          provide: CategoryDbService,
          useValue: {},
        },
        {
          provide: S3Service,
          useValue: {},
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<CategoryService>(CategoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
