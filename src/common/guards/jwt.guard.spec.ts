import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

describe('JwtAuthGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    guard = new JwtAuthGuard(reflector);
  });

  it('allows public routes without delegating to passport', () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const handler = jest.fn();
    const controllerClass = class TestController {};

    const context = {
      getHandler: jest.fn(() => handler),
      getClass: jest.fn(() => controllerClass),
    };

    expect(
      guard.canActivate(context as never),
    ).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      handler,
      controllerClass,
    ]);
  });

  it('returns the authenticated user from handleRequest', () => {
    const authenticatedUser = { sub: 'user-1' };

    expect(guard.handleRequest(null, authenticatedUser)).toBe(authenticatedUser);
  });

  it('throws a default unauthorized error when passport provides no user', () => {
    expect(() => guard.handleRequest(null, false)).toThrow(
      new UnauthorizedException('Authentication is required'),
    );
  });

  it('rethrows the original error from passport', () => {
    const error = new Error('invalid token');

    expect(() => guard.handleRequest(error, false)).toThrow(error);
  });
});
