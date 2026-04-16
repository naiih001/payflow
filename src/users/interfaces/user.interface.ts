import { Role, User } from '@prisma/client';

export { Role, type User };

export interface CreateUserInput {
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
  role: Role;
}

export type PublicUser = Omit<User, 'passwordHash'>;
