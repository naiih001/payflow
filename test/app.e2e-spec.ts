import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from './../src/app.module';
import { AppController } from '../src/app.controller';
import { AuthController } from '../src/auth/auth.controller';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { UsersController } from '../src/users/users.controller';

describe('AppController (e2e)', () => {
  let moduleFixture: TestingModule;
  let appController: AppController;
  let authController: AuthController;
  let usersController: UsersController;
  let rolesGuard: RolesGuard;
  let jwtStrategy: JwtStrategy;

  beforeEach(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    appController = moduleFixture.get(AppController);
    authController = moduleFixture.get(AuthController);
    usersController = moduleFixture.get(UsersController);
    rolesGuard = new RolesGuard(moduleFixture.get(Reflector));
    jwtStrategy = moduleFixture.get(JwtStrategy);
  });

  it('/ (GET)', () => {
    expect(appController.getStatus()).toEqual({
      service: 'payflow',
      status: 'ok',
    });
  });

  it('authenticates users and protects admin endpoints by role', async () => {
    const customerLogin = await authController.login({
        email: 'customer@payflow.dev',
        password: 'CustomerPass123',
      });

    expect(customerLogin.user.email).toBe('customer@payflow.dev');
    expect(customerLogin.user.role).toBe('CUSTOMER');

    const customerFromJwt = await jwtStrategy.validate({
      sub: customerLogin.user.sub,
      email: customerLogin.user.email,
      role: customerLogin.user.role,
    });

    expect(usersController.getCurrentUser(customerFromJwt)).toEqual(customerFromJwt);

    const customerContext = createExecutionContext(
      usersController,
      'getAdminSummary',
      customerFromJwt,
    );

    expect(() => rolesGuard.canActivate(customerContext)).toThrow(
      'You do not have access to this resource',
    );

    const adminLogin = await authController.login({
        email: 'admin@payflow.dev',
        password: 'AdminPass123',
      });

    const adminFromJwt = await jwtStrategy.validate({
      sub: adminLogin.user.sub,
      email: adminLogin.user.email,
      role: adminLogin.user.role,
    });

    const adminContext = createExecutionContext(
      usersController,
      'getAdminSummary',
      adminFromJwt,
    );

    expect(rolesGuard.canActivate(adminContext)).toBe(true);

    const adminUsers = await usersController.getAdminSummary();
    expect(adminUsers).toHaveLength(2);
    expect(adminUsers[0]).not.toHaveProperty('passwordHash');
  });

  afterEach(async () => {
    await moduleFixture.close();
  });
});

function createExecutionContext(
  controller: UsersController,
  handlerName: keyof UsersController,
  user: unknown,
): ExecutionContext {
  const request = { user };

  return {
    getClass: () => controller.constructor,
    getHandler: () =>
      controller[handlerName] as (...args: unknown[]) => unknown,
    getArgs: () => [request],
    getArgByIndex: (index: number) => [request][index],
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => undefined,
      getNext: () => undefined,
    }),
    switchToRpc: () => ({
      getData: () => undefined,
      getContext: () => undefined,
    }),
    switchToWs: () => ({
      getClient: () => undefined,
      getData: () => undefined,
      getPattern: () => undefined,
    }),
    getType: () => 'http',
  } as ExecutionContext;
}
