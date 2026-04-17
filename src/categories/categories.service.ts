import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    try {
      return await this.prisma.category.create({
        data: {
          name: dto.name.trim(),
        },
      });
    } catch (error) {
      this.handleKnownError(error, 'Category name already exists');
    }
  }

  async findAll() {
    return this.prisma.category.findMany({
      orderBy: {
        name: 'asc',
      },
      include: {
        _count: {
          select: {
            products: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async ensureExists(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.ensureExists(id);

    try {
      return await this.prisma.category.update({
        where: { id },
        data: dto.name
          ? {
              name: dto.name.trim(),
            }
          : {},
      });
    } catch (error) {
      this.handleKnownError(error, 'Category name already exists');
    }
  }

  async remove(id: string) {
    await this.ensureExists(id);

    try {
      await this.prisma.category.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Category cannot be deleted while products are assigned to it',
        );
      }

      throw error;
    }

    return {
      id,
      deleted: true,
    };
  }

  private handleKnownError(error: unknown, message: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(message);
    }

    throw error;
  }
}
