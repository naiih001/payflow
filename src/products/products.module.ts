import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [CategoriesModule, InventoryModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
