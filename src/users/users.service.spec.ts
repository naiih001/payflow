import { NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { Role, type User } from './interfaces/user.interface';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findFirst: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };

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
    prisma = {
      user: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    service = new UsersService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('finds a user by email case-insensitively', async () => {
    prisma.user.findFirst.mockResolvedValue(user);

    await expect(service.findByEmail(user.email)).resolves.toBe(user);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        email: {
          equals: user.email,
          mode: 'insensitive',
        },
        deletedAt: null,
      },
    });
  });

  it('throws when findByIdOrFail cannot find a user', async () => {
    prisma.user.findFirst.mockResolvedValue(undefined);

    await expect(service.findByIdOrFail('missing-user')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns public users ordered by creation date', async () => {
    const publicUsers = [
      {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        deletedAt: user.deletedAt,
      },
    ];

    prisma.user.findMany.mockResolvedValue(publicUsers);

    await expect(service.findAll()).resolves.toEqual(publicUsers);
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });
  });

  it('seeds the default users only when they do not already exist', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-admin' });
    prisma.user.create.mockResolvedValue(user);
    jest.mocked(bcrypt.hash).mockResolvedValue('hashed-password' as never);

    await service.onModuleInit();

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'admin@payflow.dev',
        firstName: 'Admin',
        lastName: 'User',
        passwordHash: 'hashed-password',
        role: Role.ADMIN,
      }),
    });
  });
});
