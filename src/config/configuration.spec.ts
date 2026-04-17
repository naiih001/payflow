import { validateEnvironment } from './configuration';

describe('validateEnvironment', () => {
  it('applies defaults for optional values', () => {
    expect(
      validateEnvironment({
        JWT_SECRET: 'test-secret',
        DATABASE_URL: 'postgresql://localhost/payflow',
      }),
    ).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      API_PREFIX: 'api',
      JWT_SECRET: 'test-secret',
      JWT_EXPIRES_IN: '1h',
      DATABASE_URL: 'postgresql://localhost/payflow',
      STRIPE_SECRET_KEY: undefined,
      STRIPE_WEBHOOK_SECRET: undefined,
      PAYSTACK_SECRET_KEY: undefined,
      PAYSTACK_BASE_URL: 'https://api.paystack.co',
    });
  });

  it('throws when required environment variables are missing', () => {
    expect(() => validateEnvironment({})).toThrow(
      'Environment validation failed:',
    );
    expect(() => validateEnvironment({})).toThrow(
      '- JWT_SECRET must be a non-empty string',
    );
    expect(() => validateEnvironment({})).toThrow(
      '- DATABASE_URL must be a non-empty string',
    );
  });

  it('throws when PORT is invalid', () => {
    expect(() =>
      validateEnvironment({
        JWT_SECRET: 'test-secret',
        DATABASE_URL: 'postgresql://localhost/payflow',
        PORT: '70000',
      }),
    ).toThrow('- PORT must be a valid integer between 1 and 65535');
  });
});
