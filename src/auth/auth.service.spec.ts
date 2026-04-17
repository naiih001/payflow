import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { Role, type User } from '../users/interfaces/user.interface';
import { UsersService } from '../users/users.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;

  const user: User = {
    id: 'user-1',
    email: 'customer@payflow.dev',
    firstName: 'Ada',
    lastName: 'Lovelace',
    passwordHash: 'stored-hash',
    role: Role.CUSTOMER,
    stripeCustomerId: null,
    paystackCustomerId: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    deletedAt: null,
  };

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      findByIdOrFail: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    jwtService = {
      signAsync: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    service = new AuthService(usersService, jwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('registers a new user and signs a token', async () => {
    usersService.findByEmail.mockResolvedValue(undefined);
    usersService.create.mockResolvedValue(user);
    jwtService.signAsync.mockResolvedValue('signed-token');
    jest.mocked(bcrypt.hash).mockResolvedValue('hashed-password' as never);

    const result = await service.register({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      password: 'plain-password',
      role: undefined,
    });

    expect(usersService.create).toHaveBeenCalledWith({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      passwordHash: 'hashed-password',
      role: Role.CUSTOMER,
    });
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    expect(result).toEqual({
      accessToken: 'signed-token',
      user: {
        sub: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  });

  it('rejects registration when the email already exists', async () => {
    usersService.findByEmail.mockResolvedValue(user);

    await expect(
      service.register({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        password: 'plain-password',
        role: Role.ADMIN,
      }),
    ).rejects.toThrow(ConflictException);

    expect(usersService.create).not.toHaveBeenCalled();
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('logs in a valid user', async () => {
    usersService.findByEmail.mockResolvedValue(user);
    jwtService.signAsync.mockResolvedValue('signed-token');
    jest.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const result = await service.login({
      email: user.email,
      password: 'plain-password',
    });

    expect(result.accessToken).toBe('signed-token');
    expect(result.user.email).toBe(user.email);
  });

  it('rejects login when the password does not match', async () => {
    usersService.findByEmail.mockResolvedValue(user);
    jest.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      service.login({
        email: user.email,
        password: 'wrong-password',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('returns the current profile by user id', async () => {
    usersService.findByIdOrFail.mockResolvedValue(user);

    await expect(service.getProfile(user.id)).resolves.toEqual({
      sub: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    });
  });
});
