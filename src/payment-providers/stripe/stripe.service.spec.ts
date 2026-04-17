import { InternalServerErrorException } from '@nestjs/common';
import Stripe from 'stripe';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from './stripe.service';

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: {
      create: jest.fn(),
    },
    checkout: {
      sessions: {
        create: jest.fn(),
      },
    },
    billingPortal: {
      sessions: {
        create: jest.fn(),
      },
    },
    subscriptions: {
      update: jest.fn(),
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  }));
});

const createPrismaMock = () =>
  ({
    user: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
  }) as unknown as PrismaService;

const createConfig = (overrides?: Partial<AppConfig['stripe']>): AppConfig => ({
  nodeEnv: 'test',
  port: 3000,
  apiPrefix: 'api',
  jwt: {
    secret: 'secret',
    expiresIn: '1h',
  },
  database: {
    url: 'postgresql://localhost/payflow',
  },
  stripe: {
    secretKey: 'sk_test_123',
    webhookSecret: 'whsec_test_123',
    ...overrides,
  },
  paystack: {
    baseUrl: 'https://api.paystack.co',
  },
});

describe('StripeService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reuses an existing Stripe customer id', async () => {
    const prisma = createPrismaMock();
    prisma.user.findUniqueOrThrow = jest.fn().mockResolvedValue({
      id: 'user-1',
      stripeCustomerId: 'cus_123',
    });

    const service = new StripeService(createConfig(), prisma);
    service.onModuleInit();

    await expect(
      service.ensureCustomer('user-1', 'customer@example.com'),
    ).resolves.toBe('cus_123');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('throws when initialized without a Stripe secret key', () => {
    const prisma = createPrismaMock();
    const service = new StripeService(
      createConfig({ secretKey: undefined }),
      prisma,
    );

    expect(() => service.onModuleInit()).toThrow(InternalServerErrorException);
  });

  it('cancels at period end', async () => {
    const prisma = createPrismaMock();
    const service = new StripeService(createConfig(), prisma);
    service.onModuleInit();

    await service.cancelSubscription({ providerSubscriptionId: 'sub_123' });

    const stripeClient = jest.mocked(Stripe).mock.results[0]?.value as {
      subscriptions: { update: jest.Mock };
    };
    expect(stripeClient.subscriptions.update).toHaveBeenCalledWith('sub_123', {
      cancel_at_period_end: true,
    });
  });

  it('uses the configured webhook secret when verifying events', () => {
    const prisma = createPrismaMock();
    const service = new StripeService(createConfig(), prisma);
    service.onModuleInit();

    const payload = Buffer.from('{}');
    service.constructWebhookEvent(payload, 'sig_123');

    const stripeClient = jest.mocked(Stripe).mock.results[0]?.value as {
      webhooks: { constructEvent: jest.Mock };
    };
    expect(stripeClient.webhooks.constructEvent).toHaveBeenCalledWith(
      payload,
      'sig_123',
      'whsec_test_123',
    );
  });
});
