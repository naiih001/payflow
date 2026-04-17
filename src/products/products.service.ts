import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CategoriesService } from '../categories/categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const productInclude = {
  category: true,
  inventory: true,
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesService: CategoriesService,
    private readonly inventoryService: InventoryService,
  ) {}

  async create(dto: CreateProductDto) {
    await this.categoriesService.ensureExists(dto.categoryId);

    try {
      const product = await this.prisma.product.create({
        data: {
          name: dto.name.trim(),
          description: dto.description?.trim(),
          slug: dto.slug.trim(),
          price: dto.price,
          imageUrl: dto.imageUrl,
          isActive: dto.isActive ?? true,
          categoryId: dto.categoryId,
        },
        include: productInclude,
      });

      await this.inventoryService.ensureInventoryRecord(
        product.id,
        dto.quantity ?? 0,
      );

      return this.findOne(product.id);
    } catch (error) {
      this.handleKnownError(error);
    }
  }

  async findAll(query: QueryProductsDto) {
    return this.prisma.product.findMany({
      where: {
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      },
      include: productInclude,
      orderBy: [
        {
          createdAt: 'desc',
        },
      ],
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async findBySlug(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: productInclude,
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);

    if (dto.categoryId) {
      await this.categoriesService.ensureExists(dto.categoryId);
    }

    if (dto.quantity !== undefined) {
      await this.inventoryService.setQuantity(id, dto.quantity);
    }

    try {
      await this.prisma.product.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
          ...(dto.slug !== undefined ? { slug: dto.slug.trim() } : {}),
          ...(dto.price !== undefined ? { price: dto.price } : {}),
          ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.categoryId !== undefined
            ? { categoryId: dto.categoryId }
            : {}),
        },
      });

      return this.findOne(id);
    } catch (error) {
      this.handleKnownError(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);

    try {
      await this.prisma.product.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Product cannot be deleted while it is referenced by other records',
        );
      }

      throw error;
    }

    return {
      id,
      deleted: true,
    };
  }

  private handleKnownError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Product slug already exists');
    }

    throw error;
  }
}
