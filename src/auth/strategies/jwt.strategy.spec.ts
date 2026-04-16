import configuration from '../../config/configuration';
import { JwtStrategy } from './jwt.strategy';
import { Role, type User } from '../../users/interfaces/user.interface';
import { UsersService } from '../../users/users.service';

describe('JwtStrategy', () => {
  let usersService: jest.Mocked<UsersService>;
  let strategy: JwtStrategy;

  const user: User = {
    id: 'user-1',
    email: 'admin@payflow.dev',
    firstName: 'Admin',
    lastName: 'User',
    passwordHash: 'stored-hash',
    role: Role.ADMIN,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    deletedAt: null,
  };

  beforeEach(() => {
    usersService = {
      findByIdOrFail: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    strategy = new JwtStrategy(usersService, {
      nodeEnv: 'test',
      port: 3000,
      apiPrefix: 'api',
      jwt: {
        secret: 'test-secret',
        expiresIn: '1h',
      },
      database: {
        url: 'postgresql://localhost/payflow',
      },
    } satisfies ReturnType<typeof configuration>);
  });

  it('maps a validated JWT payload into the authenticated user shape', async () => {
    usersService.findByIdOrFail.mockResolvedValue(user);

    await expect(
      strategy.validate({
        sub: user.id,
        email: user.email,
        role: user.role,
      }),
    ).resolves.toEqual({
      sub: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    });
  });
});
