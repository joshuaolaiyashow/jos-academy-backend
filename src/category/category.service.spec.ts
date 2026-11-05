import { ConflictException, NotFoundException } from '@nestjs/common';

import { CategoryService } from './category.service';
import { PrismaService } from '../prisma/prisma.service';

const CATEGORY = { id: 'cat-1', name: 'Design', description: null };

const makePrisma = () => ({
  category: {
    findUnique: jest.fn().mockResolvedValue(CATEGORY),
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue(CATEGORY),
    delete: jest.fn().mockResolvedValue(CATEGORY),
  },
  course: { count: jest.fn().mockResolvedValue(0) },
});

describe('CategoryService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: CategoryService;

  beforeEach(() => {
    prisma = makePrisma();
    service = new CategoryService(prisma as unknown as PrismaService);
  });

  it('refuses to delete a category that programs still use', async () => {
    prisma.course.count.mockResolvedValue(2);
    await expect(service.deleteCategory('cat-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.category.delete).not.toHaveBeenCalled();
  });

  it('deletes an unused category', async () => {
    await service.deleteCategory('cat-1');
    expect(prisma.category.delete).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
    });
  });

  it('returns 404 for an unknown category', async () => {
    prisma.category.findUnique.mockResolvedValue(null);
    await expect(service.deleteCategory('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a rename that clashes with another category', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'cat-2' });
    await expect(
      service.updateCategory('cat-1', { name: ' Marketing ' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { name: 'Marketing', NOT: { id: 'cat-1' } },
    });
  });

  it('trims the new name on rename', async () => {
    await service.updateCategory('cat-1', { name: '  UX Design ' });
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
      data: { name: 'UX Design', description: undefined },
    });
  });
});
