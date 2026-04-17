import { registerAs } from '@nestjs/config';

type NodeEnvironment = 'development' | 'test' | 'production';

export interface EnvironmentVariables {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  API_PREFIX: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  DATABASE_URL: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  PAYSTACK_SECRET_KEY?: string;
  PAYSTACK_BASE_URL: string;
}

export interface AppConfig {
  nodeEnv: NodeEnvironment;
  port: number;
  apiPrefix: string;
  jwt: {
    secret: string;
    expiresIn: string;
  };
  database: {
    url: string;
  };
  stripe: {
    secretKey?: string;
    webhookSecret?: string;
  };
  paystack: {
    secretKey?: string;
    baseUrl: string;
  };
}

const DEFAULT_ENVIRONMENT: NodeEnvironment = 'development';
const DEFAULT_PORT = 3000;
const DEFAULT_API_PREFIX = 'api';
const DEFAULT_JWT_EXPIRES_IN = '1h';
const DEFAULT_PAYSTACK_BASE_URL = 'https://api.paystack.co';

function toNonEmptyString(
  value: unknown,
  key: string,
  errors: string[],
  fallback?: string,
): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  if (fallback !== undefined) {
    return fallback;
  }

  errors.push(`${key} must be a non-empty string`);
  return '';
}

function toNodeEnvironment(value: unknown, errors: string[]): NodeEnvironment {
  if (value === 'development' || value === 'test' || value === 'production') {
    return value;
  }

  if (value === undefined) {
    return DEFAULT_ENVIRONMENT;
  }

  errors.push('NODE_ENV must be one of: development, test, production');
  return DEFAULT_ENVIRONMENT;
}

function toPort(value: unknown, errors: string[]): number {
  if (value === undefined || value === '') {
    return DEFAULT_PORT;
  }

  const parsed = Number.parseInt(String(value), 10);
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65535) {
    return parsed;
  }

  errors.push('PORT must be a valid integer between 1 and 65535');
  return DEFAULT_PORT;
}

function toOptionalNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const errors: string[] = [];

  const validatedConfig: EnvironmentVariables = {
    NODE_ENV: toNodeEnvironment(config.NODE_ENV, errors),
    PORT: toPort(config.PORT, errors),
    API_PREFIX: toNonEmptyString(
      config.API_PREFIX,
      'API_PREFIX',
      errors,
      DEFAULT_API_PREFIX,
    ),
    JWT_SECRET: toNonEmptyString(config.JWT_SECRET, 'JWT_SECRET', errors),
    JWT_EXPIRES_IN: toNonEmptyString(
      config.JWT_EXPIRES_IN,
      'JWT_EXPIRES_IN',
      errors,
      DEFAULT_JWT_EXPIRES_IN,
    ),
    DATABASE_URL: toNonEmptyString(config.DATABASE_URL, 'DATABASE_URL', errors),
    STRIPE_SECRET_KEY: toOptionalNonEmptyString(config.STRIPE_SECRET_KEY),
    STRIPE_WEBHOOK_SECRET: toOptionalNonEmptyString(
      config.STRIPE_WEBHOOK_SECRET,
    ),
    PAYSTACK_SECRET_KEY: toOptionalNonEmptyString(config.PAYSTACK_SECRET_KEY),
    PAYSTACK_BASE_URL: toNonEmptyString(
      config.PAYSTACK_BASE_URL,
      'PAYSTACK_BASE_URL',
      errors,
      DEFAULT_PAYSTACK_BASE_URL,
    ),
  };

  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`,
    );
  }

  return validatedConfig;
}

export default registerAs('app', (): AppConfig => {
  const env = validateEnvironment(process.env);

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    apiPrefix: env.API_PREFIX,
    jwt: {
      secret: env.JWT_SECRET,
      expiresIn: env.JWT_EXPIRES_IN,
    },
    database: {
      url: env.DATABASE_URL,
    },
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    },
    paystack: {
      secretKey: env.PAYSTACK_SECRET_KEY,
      baseUrl: env.PAYSTACK_BASE_URL,
    },
  };
});
