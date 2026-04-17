import {
  Inject,
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import Stripe from 'stripe';
import configuration from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CancelSubscriptionParams,
  CheckoutSessionResult,
  CreateOrderCheckoutSessionParams,
  CreateSubscriptionCheckoutSessionParams,
  IPaymentProvider,
} from '../payment-provider.interface';

type StripeClient = InstanceType<typeof Stripe>;
type StripeWebhookEvent = ReturnType<StripeClient['webhooks']['constructEvent']>;

@Injectable()
export class StripeService implements IPaymentProvider, OnModuleInit {
  public client!: StripeClient;

  constructor(
    @Inject(configuration.KEY)
    private readonly appConfig: ConfigType<typeof configuration>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const secretKey = this.appConfig.stripe.secretKey;
    if (!secretKey) {
      throw new InternalServerErrorException(
        'STRIPE_SECRET_KEY is required to initialize Stripe',
      );
    }

    this.client = new Stripe(secretKey, {
      apiVersion: '2025-08-27.basil',
    });
  }

  async ensureCustomer(userId: string, email: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    const customer = await this.client.customers.create({
      email,
      metadata: { userId },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  async createOrderCheckoutSession(
    params: CreateOrderCheckoutSessionParams,
  ): Promise<CheckoutSessionResult> {
    const session = await this.client.checkout.sessions.create({
      customer: params.customerId,
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: params.lineItems.map((item) => ({
        price_data: {
          currency: params.currency.toLowerCase(),
          unit_amount: item.unitAmount,
          product_data: {
            name: item.name,
          },
        },
        quantity: item.quantity,
      })),
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: {
        orderId: params.orderId,
        ...params.metadata,
      },
    });

    return {
      sessionId: session.id,
      url: session.url ?? '',
      providerRef: session.id,
    };
  }

  async createSubscriptionCheckoutSession(
    params: CreateSubscriptionCheckoutSessionParams,
  ): Promise<CheckoutSessionResult> {
    const session = await this.client.checkout.sessions.create({
      customer: params.customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
    });

    return {
      sessionId: session.id,
      url: session.url ?? '',
      providerRef: session.id,
    };
  }

  async createBillingPortalSession(
    customerId: string,
    returnUrl: string,
  ): Promise<{ url: string }> {
    const session = await this.client.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  async cancelSubscription(params: CancelSubscriptionParams): Promise<void> {
    await this.client.subscriptions.update(params.providerSubscriptionId, {
      cancel_at_period_end: true,
    });
  }

  constructWebhookEvent(
    payload: Buffer,
    signature: string,
  ): StripeWebhookEvent {
    const webhookSecret = this.appConfig.stripe.webhookSecret;
    if (!webhookSecret) {
      throw new InternalServerErrorException(
        'STRIPE_WEBHOOK_SECRET is required to verify Stripe webhooks',
      );
    }

    return this.client.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );
  }
}
