import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateUserInput,
  PublicUser,
  Role,
  User,
} from './interfaces/user.interface';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.seedUsers();
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const user = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
        deletedAt: null,
      },
    });

    return user ?? undefined;
  }

  async findById(userId: string): Promise<User | undefined> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
    });

    return user ?? undefined;
  }

  async findByIdOrFail(userId: string): Promise<User> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async create(input: CreateUserInput): Promise<User> {
    return this.prisma.user.create({
      data: input,
    });
  }

  async findAll(): Promise<PublicUser[]> {
    return this.prisma.user.findMany({
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
  }

  private async seedUsers(): Promise<void> {
    const seedUsers = [
      {
        email: 'admin@payflow.dev',
        firstName: 'Admin',
        lastName: 'User',
        password: 'AdminPass123',
        role: Role.ADMIN,
      },
      {
        email: 'customer@payflow.dev',
        firstName: 'Customer',
        lastName: 'User',
        password: 'CustomerPass123',
        role: Role.CUSTOMER,
      },
    ];

    for (const seedUser of seedUsers) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: seedUser.email },
      });

      if (existingUser) {
        continue;
      }

      await this.prisma.user.create({
        data: {
          email: seedUser.email,
          firstName: seedUser.firstName,
          lastName: seedUser.lastName,
          passwordHash: await bcrypt.hash(seedUser.password, 10),
          role: seedUser.role,
        },
      });
    }
  }
}
