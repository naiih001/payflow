import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from '../src/app.controller';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { Role } from '../src/users/interfaces/user.interface';
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';

describe('Application wiring (e2e)', () => {
  let moduleRef: TestingModule;
  let appController: AppController;
  let authController: AuthController;
  let usersController: UsersController;
  let authService: jest.Mocked<AuthService>;
  let usersService: jest.Mocked<UsersService>;

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
      getProfile: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;

    usersService = {
      findAll: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    moduleRef = await Test.createTestingModule({
      controllers: [AppController, AuthController, UsersController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    appController = moduleRef.get(AppController);
    authController = moduleRef.get(AuthController);
    usersController = moduleRef.get(UsersController);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('returns the service status from the root controller', () => {
    expect(appController.getStatus()).toEqual({
      service: 'payflow',
      status: 'ok',
    });
  });

  it('proxies auth and user controller calls to their services', async () => {
    authService.login.mockResolvedValue({
      accessToken: 'token',
      user: {
        sub: 'user-1',
        email: 'customer@payflow.dev',
        role: Role.CUSTOMER,
        firstName: 'Ada',
        lastName: 'Lovelace',
      },
    });
    authService.getProfile.mockResolvedValue({
      sub: 'user-1',
      email: 'customer@payflow.dev',
      role: Role.CUSTOMER,
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    usersService.findAll.mockResolvedValue([
      {
        id: 'user-1',
        email: 'customer@payflow.dev',
        role: Role.CUSTOMER,
        firstName: 'Ada',
        lastName: 'Lovelace',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        deletedAt: null,
      },
    ]);

    await expect(
      authController.login({
        email: 'customer@payflow.dev',
        password: 'CustomerPass123',
      }),
    ).resolves.toEqual({
      accessToken: 'token',
      user: {
        sub: 'user-1',
        email: 'customer@payflow.dev',
        role: Role.CUSTOMER,
        firstName: 'Ada',
        lastName: 'Lovelace',
      },
    });

    expect(authService.login).toHaveBeenCalledWith({
      email: 'customer@payflow.dev',
      password: 'CustomerPass123',
    });

    await expect(
      authController.getProfile({
        sub: 'user-1',
        email: 'customer@payflow.dev',
        role: Role.CUSTOMER,
        firstName: 'Ada',
        lastName: 'Lovelace',
      }),
    ).resolves.toEqual({
      sub: 'user-1',
      email: 'customer@payflow.dev',
      role: Role.CUSTOMER,
      firstName: 'Ada',
      lastName: 'Lovelace',
    });

    await expect(usersController.getAdminSummary()).resolves.toHaveLength(1);
    expect(usersService.findAll).toHaveBeenCalled();
  });
});
