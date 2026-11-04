import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { AuditDbService } from './audit.db.service';

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: AuditDbService,
          useValue: {
            create: jest.fn().mockResolvedValue({}),
            findMany: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
          },
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
