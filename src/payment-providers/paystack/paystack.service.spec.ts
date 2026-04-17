import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { createHmac } from 'crypto';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { PaystackService } from './paystack.service';

const paystackConfig = (secretKey?: string): AppConfig => ({
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
  stripe: {},
  paystack: {
    secretKey,
    baseUrl: 'https://api.paystack.co',
  },
});

const createPrismaMock = () =>
  ({
    user: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
  }) as unknown as PrismaService;

describe('PaystackService', () => {
  it('reuses an existing Paystack customer code', async () => {
    const prisma = createPrismaMock();
    prisma.user.findUniqueOrThrow = jest.fn().mockResolvedValue({
      id: 'user-1',
      paystackCustomerId: 'CUS_paystack_123',
    });

    const service = new PaystackService(paystackConfig('sk_test_123'), prisma);

    await expect(
      service.ensureCustomer('user-1', 'customer@example.com'),
    ).resolves.toBe('CUS_paystack_123');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('throws when initialized without a Paystack secret key', () => {
    const prisma = createPrismaMock();
    const service = new PaystackService(paystackConfig(), prisma);

    expect(() => service.onModuleInit()).toThrow(InternalServerErrorException);
  });

  it('requires the cancellation token for Paystack subscription disable', async () => {
    const prisma = createPrismaMock();
    const service = new PaystackService(paystackConfig('sk_test_123'), prisma);

    await expect(
      service.cancelSubscription({ providerSubscriptionId: 'SUB_123' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('verifies webhook signatures with sha512 HMAC', () => {
    const prisma = createPrismaMock();
    const service = new PaystackService(paystackConfig('sk_test_123'), prisma);

    const payload = Buffer.from(JSON.stringify({ event: 'charge.success' }));
    const signature = createHmac('sha512', 'sk_test_123')
      .update(payload)
      .digest('hex');

    expect(service.verifyWebhookSignature(payload, signature)).toBe(true);
    expect(service.verifyWebhookSignature(payload, 'invalid')).toBe(false);
  });
});
