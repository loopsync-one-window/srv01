import { Test, TestingModule } from '@nestjs/testing';
import { FeaturesService } from '../features.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('FeaturesService', () => {
  let service: FeaturesService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeaturesService,
        {
          provide: PrismaService,
          useValue: {
            feature: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            planFeature: {
              findMany: jest.fn(),
              create: jest.fn(),
            },
            user: {
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<FeaturesService>(FeaturesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all features', async () => {
      const features = [
        {
          id: '1',
          key: 'feature1',
          label: 'Feature 1',
          description: 'Description 1',
          dataType: 'BOOLEAN',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          key: 'feature2',
          label: 'Feature 2',
          description: 'Description 2',
          dataType: 'NUMBER',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (prisma.feature.findMany as jest.Mock).mockResolvedValue(features);

      const result = await service.findAll();
      expect(result).toEqual(features);
    });
  });
});
