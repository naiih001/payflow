import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { StringValue } from 'ms';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import configuration from '../config/configuration';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule,
    ConfigModule.forFeature(configuration),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule.forFeature(configuration)],
      inject: [configuration.KEY],
      useFactory: (appConfig: ConfigType<typeof configuration>) => ({
        secret: appConfig.jwt.secret,
        signOptions: {
          expiresIn: appConfig.jwt.expiresIn as StringValue,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
