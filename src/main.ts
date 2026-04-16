import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import configuration from './config/configuration';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  const appConfig = app.get<ConfigType<typeof configuration>>(configuration.KEY);
  const prismaService = app.get(PrismaService);

  app.setGlobalPrefix(appConfig.apiPrefix, {
    exclude: [{ path: 'webhooks/(.*)', method: RequestMethod.ALL }],
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();
  await prismaService.enableShutdownHooks(app);
  await app.listen(appConfig.port);
}
bootstrap();
