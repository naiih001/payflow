import { Role } from '../../users/interfaces/user.interface';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
}
