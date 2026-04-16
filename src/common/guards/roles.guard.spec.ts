import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../../users/interfaces/user.interface';

describe('RolesGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    guard = new RolesGuard(reflector);
  });

  it('allows access when no roles metadata exists', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const handler = jest.fn();
    const controllerClass = class TestController {};

    const context = {
      getHandler: jest.fn(() => handler),
      getClass: jest.fn(() => controllerClass),
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
    };

    expect(guard.canActivate(context as never)).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      handler,
      controllerClass,
    ]);
  });

  it('throws when the request user role is not allowed', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            role: Role.CUSTOMER,
          },
        }),
      }),
    };

    expect(() => guard.canActivate(context as never)).toThrow(
      new ForbiddenException('You do not have access to this resource'),
    );
  });

  it('allows access when the request user role matches', () => {
    reflector.getAllAndOverride.mockReturnValue([Role.ADMIN]);

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            role: Role.ADMIN,
          },
        }),
      }),
    };

    expect(guard.canActivate(context as never)).toBe(true);
  });
});
