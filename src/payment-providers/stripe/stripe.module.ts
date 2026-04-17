import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from '../../config/configuration';
import { PrismaModule } from '../../prisma/prisma.module';
import { StripeService } from './stripe.service';

@Module({
  imports: [ConfigModule.forFeature(configuration), PrismaModule],
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}
