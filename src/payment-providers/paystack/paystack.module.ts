import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from '../../config/configuration';
import { PrismaModule } from '../../prisma/prisma.module';
import { PaystackService } from './paystack.service';

@Module({
  imports: [ConfigModule.forFeature(configuration), PrismaModule],
  providers: [PaystackService],
  exports: [PaystackService],
})
export class PaystackModule {}
