import { Role } from '../../users/interfaces/user.interface';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}
