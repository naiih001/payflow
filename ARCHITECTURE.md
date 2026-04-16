# NestJS Commerce + SaaS Platform — Architecture

## Overview

This is a **single NestJS monolith** with two distinct payment modes:

| Mode | Use Case | Payment Flow |
|---|---|---|
| **E-commerce** | One-time product purchases | Cart → Order → Stripe/Paystack Checkout → Webhook → Fulfill |
| **SaaS** | Recurring subscriptions | Plan select → Stripe/Paystack Subscription → Webhook → Feature gate |

Both modes share: auth, users, the payment provider abstraction, and the webhook system.

---

## Directory Structure

```
src/
├── main.ts                         # rawBody: true — CRITICAL for webhook sig verification
├── app.module.ts
│
├── config/
│   └── configuration.ts            # Typed env config via @nestjs/config
│
├── common/
│   ├── guards/
│   │   ├── jwt.guard.ts
│   │   ├── roles.guard.ts
│   │   └── subscription.guard.ts   # Feature gating by plan tier
│   ├── decorators/
│   │   ├── current-user.decorator.ts
│   │   └── requires-plan.decorator.ts
│   ├── filters/
│   │   └── http-exception.filter.ts
│   ├── interceptors/
│   │   └── transform.interceptor.ts
│   └── pipes/
│       └── zod-validation.pipe.ts
│
├── prisma/
│   ├── prisma.service.ts
│   └── schema.prisma               # Full schema below
│
├── auth/                           # JWT + bcrypt, standard
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   └── strategies/
│       └── jwt.strategy.ts
│
├── users/
│   ├── users.module.ts
│   ├── users.service.ts
│   └── users.controller.ts
│
├── products/                       # E-commerce: catalog + inventory
│   ├── products.module.ts
│   ├── products.controller.ts
│   ├── products.service.ts         # Inventory lock via Prisma transactions
│   └── dto/
│       ├── create-product.dto.ts

│       └── update-product.dto.ts
│

├── categories/                     # Product categorization
│   └── ...
│
├── cart/                           # In-memory (Redis) or DB cart
│   ├── cart.module.ts

│   ├── cart.controller.ts
│   ├── cart.service.ts             # add/remove/clear/apply-coupon
│   └── dto/
│       └── add-to-cart.dto.ts
│

├── discounts/                      # Coupon codes
│   ├── discounts.module.ts
│   ├── discounts.service.ts        # validate + apply discount
│   └── dto/
│       └── apply-discount.dto.ts
│

├── orders/                         # Order lifecycle
│   ├── orders.module.ts
│   ├── orders.controller.ts
│   ├── orders.service.ts           # create, fulfill, cancel
│   └── dto/
│       └── create-order.dto.ts
│
├── plans/                          # SaaS: subscription plan definitions
│   ├── plans.module.ts
│   ├── plans.controller.ts         # GET /plans — public
│   ├── plans.service.ts
│   └── seeds/

│       └── plans.seed.ts
│
├── subscriptions/                  # SaaS: subscription state
│   ├── subscriptions.module.ts
│   ├── subscriptions.controller.ts # cancel, get current, billing portal
│   └── subscriptions.service.ts
│
├── checkout/                       # BOTH modes entry point
│   ├── checkout.module.ts
│   ├── checkout.controller.ts      # POST /checkout/order, /checkout/subscription
│   ├── checkout.service.ts         # Orchestrates provider + mode
│   └── dto/
│       ├── create-order-checkout.dto.ts

│       └── create-subscription-checkout.dto.ts
│
├── payment-providers/              # Provider abstraction layer
│   ├── payment-provider.interface.ts
│   ├── stripe/
│   │   ├── stripe.module.ts        # DynamicModule, forRootAsync
│   │   └── stripe.service.ts
│   └── paystack/
│       ├── paystack.module.ts
│       └── paystack.service.ts     # axios wrapper around Paystack REST API
│
└── webhooks/                       # Async event handling — source of truth
    ├── webhooks.module.ts
    ├── webhooks.controller.ts      # POST /webhooks/stripe, /webhooks/paystack
    └── handlers/

        ├── stripe-webhook.handler.ts

        └── paystack-webhook.handler.ts
```


---

## Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Users ───────────────────────────────────────────────────────────────────

model User {
  id                 String        @id @default(cuid())
  email              String        @unique
  passwordHash       String
  firstName          String
  lastName           String
  role               Role          @default(CUSTOMER)
  stripeCustomerId   String?       @unique
  paystackCustomerId String?       @unique

  cart               Cart?
  orders             Order[]
  subscription       Subscription?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?

  @@index([email])
}

enum Role {
  CUSTOMER
  ADMIN
}

// ─── Products ────────────────────────────────────────────────────────────────

model Category {
  id       String    @id @default(cuid())
  name     String    @unique
  products Product[]
}

model Product {
  id          String   @id @default(cuid())
  name        String
  description String?
  slug        String   @unique
  price       Int      // in smallest currency unit (kobo / cents)
  imageUrl    String?
  isActive    Boolean  @default(true)

  categoryId  String
  category    Category @relation(fields: [categoryId], references: [id])

  inventory   Inventory?
  cartItems   CartItem[]
  orderItems  OrderItem[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([categoryId, isActive])
  @@index([slug])
}

model Inventory {
  id        String  @id @default(cuid())
  productId String  @unique
  product   Product @relation(fields: [productId], references: [id])
  quantity  Int     @default(0)
  reserved  Int     @default(0) // locked during pending orders


  @@index([productId])
}

// ─── Cart ─────────────────────────────────────────────────────────────────────

model Cart {
  id         String     @id @default(cuid())
  userId     String     @unique
  user       User       @relation(fields: [userId], references: [id])
  discountId String?
  discount   Discount?  @relation(fields: [discountId], references: [id])
  items      CartItem[]
  updatedAt  DateTime   @updatedAt
}

model CartItem {
  id        String  @id @default(cuid())
  cartId    String
  cart      Cart    @relation(fields: [cartId], references: [id], onDelete: Cascade)
  productId String
  product   Product @relation(fields: [productId], references: [id])
  quantity  Int


  @@unique([cartId, productId])

}


// ─── Discounts ────────────────────────────────────────────────────────────────


model Discount {
  id             String       @id @default(cuid())
  code           String       @unique
  type           DiscountType
  value          Int          // percent (0-100) or flat amount in cents/kobo

  maxUses        Int?
  timesUsed      Int          @default(0)
  expiresAt      DateTime?
  isActive       Boolean      @default(true)
  carts          Cart[]
  orders         Order[]

  createdAt DateTime @default(now())
}

enum DiscountType {
  PERCENTAGE
  FLAT
}

// ─── Orders ───────────────────────────────────────────────────────────────────

model Order {
  id              String      @id @default(cuid())
  userId          String
  user            User        @relation(fields: [userId], references: [id])
  items           OrderItem[]
  discountId      String?
  discount        Discount?   @relation(fields: [discountId], references: [id])
  subtotal        Int
  discountAmount  Int         @default(0)
  total           Int
  currency        String      @default("NGN")
  status          OrderStatus @default(PENDING)
  provider        PaymentProvider
  providerRef     String?     @unique // Stripe/Paystack session or reference ID
  metadata        Json?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, status])
  @@index([providerRef])
}

model OrderItem {
  id        String  @id @default(cuid())
  orderId   String
  order     Order   @relation(fields: [orderId], references: [id])
  productId String
  product   Product @relation(fields: [productId], references: [id])
  quantity  Int
  unitPrice Int     // snapshot price at time of order
}

enum OrderStatus {
  PENDING      // checkout session created
  PAID         // webhook confirmed payment
  FULFILLED    // shipped / delivered

  CANCELED
  REFUNDED
}

enum PaymentProvider {
  STRIPE
  PAYSTACK
}

// ─── SaaS Plans ───────────────────────────────────────────────────────────────

model Plan {
  id               String         @id @default(cuid())
  name             String         @unique // "free" | "pro" | "enterprise"
  displayName      String
  stripePriceId    String?        @unique
  paystackPlanCode String?        @unique
  priceMonthly     Int            // in cents/kobo
  priceYearly      Int
  features         Json           // { api_calls: 10000, team_members: 5, ... }
  isActive         Boolean        @default(true)
  subscriptions    Subscription[]
}

model Subscription {
  id                    String             @id @default(cuid())
  userId                String             @unique
  user                  User               @relation(fields: [userId], references: [id])
  planId                String
  plan                  Plan               @relation(fields: [planId], references: [id])
  provider              PaymentProvider
  providerSubscriptionId String            @unique
  status                SubscriptionStatus
  currentPeriodStart    DateTime
  currentPeriodEnd      DateTime
  cancelAtPeriodEnd     Boolean            @default(false)
  interval              BillingInterval    @default(MONTHLY)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, status])
}

enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELED
  INCOMPLETE
}

enum BillingInterval {
  MONTHLY
  YEARLY
}
```

---

## Key Files

### `main.ts` — rawBody is mandatory for webhook verification


```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // REQUIRED: Stripe/Paystack webhook signature verification needs the raw buffer
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

```

---

### `payment-provider.interface.ts` — The abstraction that makes dual-provider work

```typescript
// src/payment-providers/payment-provider.interface.ts


export interface CheckoutSessionResult {
  sessionId: string;
  url: string;         // redirect user here
  providerRef: string; // store on Order/Subscription for webhook matching
}

export interface IPaymentProvider {
  // E-commerce: one-time payment
  createOrderCheckoutSession(params: {
    orderId: string;
    lineItems: { name: string; unitAmount: number; quantity: number }[];
    currency: string;
    customerId: string;
    successUrl: string;

    cancelUrl: string;
    metadata?: Record<string, string>;
  }): Promise<CheckoutSessionResult>;

  // SaaS: recurring subscription
  createSubscriptionCheckoutSession(params: {
    priceId: string;       // Stripe priceId OR Paystack plan code
    customerId: string;    // Stripe customerId OR Paystack customer code
    successUrl: string;
    cancelUrl: string;

    metadata?: Record<string, string>;
  }): Promise<CheckoutSessionResult>;

  // SaaS: customer billing portal
  createBillingPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }>;

  // SaaS: cancel subscription
  cancelSubscription(providerSubscriptionId: string): Promise<void>;

  // Ensure provider customer exists, create if not
  ensureCustomer(userId: string, email: string): Promise<string>; // returns customerId
}
```


---

### `stripe.service.ts`

```typescript
// src/payment-providers/stripe/stripe.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import Stripe from 'stripe';

import { IPaymentProvider, CheckoutSessionResult } from '../payment-provider.interface';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StripeService implements IPaymentProvider, OnModuleInit {
  public client: Stripe;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}


  onModuleInit() {
    this.client = new Stripe(this.config.getOrThrow('STRIPE_SECRET_KEY'), {

      apiVersion: '2024-06-20',
    });

  }

  async ensureCustomer(userId: string, email: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.stripeCustomerId) return user.stripeCustomerId;

    const customer = await this.client.customers.create({ email, metadata: { userId } });

    await this.prisma.user.update({

      where: { id: userId },
      data: { stripeCustomerId: customer.id },
    });
    return customer.id;
  }


  async createOrderCheckoutSession(params: {

    orderId: string;
    lineItems: { name: string; unitAmount: number; quantity: number }[];
    currency: string;
    customerId: string;
    successUrl: string;
    cancelUrl: string;

    metadata?: Record<string, string>;
  }): Promise<CheckoutSessionResult> {
    const session = await this.client.checkout.sessions.create({
      customer: params.customerId,
      payment_method_types: ['card'],

      mode: 'payment',
      line_items: params.lineItems.map((item) => ({
        price_data: {
          currency: params.currency.toLowerCase(),
          unit_amount: item.unitAmount,
          product_data: { name: item.name },
        },
        quantity: item.quantity,
      })),
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: { orderId: params.orderId, ...params.metadata },
    });

    return { sessionId: session.id, url: session.url!, providerRef: session.id };
  }

  async createSubscriptionCheckoutSession(params: {
    priceId: string;
    customerId: string;
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }): Promise<CheckoutSessionResult> {
    const session = await this.client.checkout.sessions.create({
      customer: params.customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
    });

    return { sessionId: session.id, url: session.url!, providerRef: session.id };
  }

  async createBillingPortalSession(customerId: string, returnUrl: string) {
    const session = await this.client.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return { url: session.url };
  }

  async cancelSubscription(providerSubscriptionId: string) {
    await this.client.subscriptions.update(providerSubscriptionId, {
      cancel_at_period_end: true,
    });
  }

  constructWebhookEvent(payload: Buffer, sig: string): Stripe.Event {
    return this.client.webhooks.constructEvent(
      payload,
      sig,
      this.config.getOrThrow('STRIPE_WEBHOOK_SECRET'),
    );
  }
}
```

---


### `paystack.service.ts`

```typescript
// src/payment-providers/paystack/paystack.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import { IPaymentProvider, CheckoutSessionResult } from '../payment-provider.interface';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PaystackService implements IPaymentProvider, OnModuleInit {
  private http: AxiosInstance;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.http = axios.create({
      baseURL: 'https://api.paystack.co',
      headers: {
        Authorization: `Bearer ${this.config.getOrThrow('PAYSTACK_SECRET_KEY')}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async ensureCustomer(userId: string, email: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.paystackCustomerId) return user.paystackCustomerId;

    const { data } = await this.http.post('/customer', { email, metadata: { userId } });
    const customerCode = data.data.customer_code;

    await this.prisma.user.update({
      where: { id: userId },
      data: { paystackCustomerId: customerCode },
    });
    return customerCode;
  }

  async createOrderCheckoutSession(params: {
    orderId: string;
    lineItems: { name: string; unitAmount: number; quantity: number }[];
    currency: string;
    customerId: string;
    successUrl: string;

    cancelUrl: string;
    metadata?: Record<string, string>;
  }): Promise<CheckoutSessionResult> {
    const total = params.lineItems.reduce(
      (sum, item) => sum + item.unitAmount * item.quantity,
      0,
    );

    const { data } = await this.http.post('/transaction/initialize', {
      email: params.metadata?.email,
      amount: total,
      currency: params.currency,
      callback_url: params.successUrl,
      metadata: { orderId: params.orderId, ...params.metadata },
    });

    return {
      sessionId: data.data.reference,
      url: data.data.authorization_url,
      providerRef: data.data.reference,
    };
  }


  async createSubscriptionCheckoutSession(params: {
    priceId: string;       // Paystack plan code
    customerId: string;    // Paystack customer code
    successUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
  }): Promise<CheckoutSessionResult> {
    // Paystack: initialize transaction with plan code triggers subscription

    const { data } = await this.http.post('/transaction/initialize', {
      email: params.metadata?.email,
      plan: params.priceId,
      callback_url: params.successUrl,
      metadata: params.metadata,
    });

    return {
      sessionId: data.data.reference,
      url: data.data.authorization_url,
      providerRef: data.data.reference,
    };
  }


  async createBillingPortalSession(_customerId: string, returnUrl: string) {
    // Paystack has no hosted portal — return manage URL stub
    return { url: `${returnUrl}/billing` };
  }

  async cancelSubscription(providerSubscriptionId: string) {
    await this.http.post(`/subscription/disable`, {
      code: providerSubscriptionId,
      token: '', // subscription email token — must be stored at creation
    });

  }

  verifyWebhookSignature(payload: Buffer, signature: string): boolean {
    const hash = crypto
      .createHmac('sha512', this.config.getOrThrow('PAYSTACK_SECRET_KEY'))
      .update(payload)
      .digest('hex');
    return hash === signature;
  }
}
```

---

### `checkout.service.ts` — The orchestrator

```typescript
// src/checkout/checkout.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../payment-providers/stripe/stripe.service';
import { PaystackService } from '../payment-providers/paystack/paystack.service';
import { PaymentProvider } from '@prisma/client';
import { CreateOrderCheckoutDto } from './dto/create-order-checkout.dto';
import { CreateSubscriptionCheckoutDto } from './dto/create-subscription-checkout.dto';


@Injectable()
export class CheckoutService {

  constructor(
    private prisma: PrismaService,
    private stripe: StripeService,
    private paystack: PaystackService,
    private config: ConfigService,
  ) {}

  private getProvider(provider: PaymentProvider) {
    return provider === PaymentProvider.STRIPE ? this.stripe : this.paystack;
  }

  // ─── E-commerce Checkout ─────────────────────────────────────────────────


  async initiateOrderCheckout(userId: string, dto: CreateOrderCheckoutDto) {
    // 1. Load cart with items

    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: { items: { include: { product: true } }, discount: true },

    });

    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    // 2. Validate stock
    for (const item of cart.items) {
      const inv = await this.prisma.inventory.findUnique({
        where: { productId: item.productId },
      });
      const available = (inv?.quantity ?? 0) - (inv?.reserved ?? 0);
      if (available < item.quantity) {
        throw new BadRequestException(`Insufficient stock for: ${item.product.name}`);
      }
    }

    // 3. Compute totals
    const subtotal = cart.items.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0,
    );
    let discountAmount = 0;
    if (cart.discount) {
      discountAmount =
        cart.discount.type === 'PERCENTAGE'
          ? Math.floor((subtotal * cart.discount.value) / 100)
          : cart.discount.value;
    }
    const total = subtotal - discountAmount;

    // 4. Create Order (PENDING)
    const order = await this.prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          userId,
          subtotal,
          discountAmount,
          total,
          currency: dto.currency ?? 'NGN',
          status: 'PENDING',
          provider: dto.provider,
          discountId: cart.discountId,
          items: {
            create: cart.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.product.price,
            })),
          },
        },
      });

      // Reserve inventory
      for (const item of cart.items) {
        await tx.inventory.update({
          where: { productId: item.productId },
          data: { reserved: { increment: item.quantity } },
        });
      }

      return newOrder;
    });

    // 5. Ensure provider customer exists
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const provider = this.getProvider(dto.provider);
    const customerId = await provider.ensureCustomer(userId, user.email);


    // 6. Create checkout session
    const baseUrl = this.config.getOrThrow('APP_URL');
    const session = await provider.createOrderCheckoutSession({
      orderId: order.id,
      currency: order.currency,
      customerId,
      lineItems: cart.items.map((item) => ({
        name: item.product.name,
        unitAmount: item.product.price,
        quantity: item.quantity,
      })),
      successUrl: `${baseUrl}/checkout/success?orderId=${order.id}`,
      cancelUrl: `${baseUrl}/checkout/cancel?orderId=${order.id}`,
      metadata: { userId, email: user.email },
    });


    // 7. Store providerRef on order
    await this.prisma.order.update({
      where: { id: order.id },
      data: { providerRef: session.providerRef },
    });


    return { checkoutUrl: session.url, orderId: order.id };
  }

  // ─── SaaS Subscription Checkout ──────────────────────────────────────────

  async initiateSubscriptionCheckout(userId: string, dto: CreateSubscriptionCheckoutDto) {
    const plan = await this.prisma.plan.findUniqueOrThrow({ where: { id: dto.planId } });

    const priceId =
      dto.provider === PaymentProvider.STRIPE
        ? plan.stripePriceId
        : plan.paystackPlanCode;

    if (!priceId) {
      throw new BadRequestException(`Plan not configured for provider: ${dto.provider}`);
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const provider = this.getProvider(dto.provider);
    const customerId = await provider.ensureCustomer(userId, user.email);


    const baseUrl = this.config.getOrThrow('APP_URL');

    const session = await provider.createSubscriptionCheckoutSession({
      priceId,
      customerId,
      successUrl: `${baseUrl}/billing/success`,
      cancelUrl: `${baseUrl}/billing/cancel`,
      metadata: { userId, planId: plan.id, email: user.email },
    });

    return { checkoutUrl: session.url };
  }
}
```

---

### `stripe-webhook.handler.ts`

```typescript
// src/webhooks/handlers/stripe-webhook.handler.ts
import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../../payment-providers/stripe/stripe.service';

@Injectable()

export class StripeWebhookHandler {
  private logger = new Logger('StripeWebhook');

  constructor(
    private prisma: PrismaService,
    private stripe: StripeService,
  ) {}

  async handle(rawBody: Buffer, sig: string) {
    const event = this.stripe.constructWebhookEvent(rawBody, sig);
    this.logger.log(`Stripe event: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        this.logger.warn(`Unhandled event type: ${event.type}`);
    }
  }

  private async handleCheckoutComplete(session: Stripe.Checkout.Session) {

    if (session.mode === 'payment') {
      // E-commerce: mark order PAID, release inventory reservation
      const orderId = session.metadata?.orderId;
      if (!orderId) return;

      await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.update({
          where: { id: orderId },
          data: { status: 'PAID' },
          include: { items: true },
        });

        // Release reservation, decrement actual quantity
        for (const item of order.items) {
          await tx.inventory.update({
            where: { productId: item.productId },
            data: {
              quantity: { decrement: item.quantity },
              reserved: { decrement: item.quantity },
            },
          });
        }

        // Clear cart
        await tx.cart.deleteMany({ where: { userId: order.userId } });
      });
    }
    // subscription mode handled by customer.subscription.created event
  }

  private async handleSubscriptionUpdated(sub: Stripe.Subscription) {
    const userId = sub.metadata?.userId;
    if (!userId) return;

    const plan = await this.prisma.plan.findFirst({
      where: { stripePriceId: sub.items.data[0].price.id },
    });
    if (!plan) return;

    await this.prisma.subscription.upsert({
      where: { providerSubscriptionId: sub.id },
      create: {
        userId,
        planId: plan.id,
        provider: 'STRIPE',
        providerSubscriptionId: sub.id,
        status: sub.status.toUpperCase() as any,
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        interval: sub.items.data[0].price.recurring?.interval === 'year' ? 'YEARLY' : 'MONTHLY',
      },
      update: {
        status: sub.status.toUpperCase() as any,
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        planId: plan.id,
      },
    });
  }

  private async handleSubscriptionDeleted(sub: Stripe.Subscription) {
    await this.prisma.subscription.updateMany({
      where: { providerSubscriptionId: sub.id },
      data: { status: 'CANCELED' },
    });
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice) {
    if (!invoice.subscription) return;
    await this.prisma.subscription.updateMany({
      where: { providerSubscriptionId: invoice.subscription as string },
      data: { status: 'PAST_DUE' },
    });
  }
}
```

---

### `subscription.guard.ts` — Feature Gating

```typescript
// src/common/guards/subscription.guard.ts
import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';

const PLAN_HIERARCHY = ['free', 'pro', 'enterprise'];

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private reflector: Reflector, private prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const requiredPlan = this.reflector.get<string>('requires_plan', ctx.getHandler());
    if (!requiredPlan) return true;

    const { user } = ctx.switchToHttp().getRequest();
    const sub = await this.prisma.subscription.findUnique({
      where: { userId: user.id },

      include: { plan: true },
    });

    if (!sub || sub.status !== 'ACTIVE') {
      throw new ForbiddenException('Active subscription required');
    }

    const userTier = PLAN_HIERARCHY.indexOf(sub.plan.name);
    const requiredTier = PLAN_HIERARCHY.indexOf(requiredPlan);

    if (userTier < requiredTier) {
      throw new ForbiddenException(`Requires ${requiredPlan} plan or higher`);
    }

    return true;

  }
}

// Decorator usage:
// @RequiresPlan('pro')
// @UseGuards(JwtGuard, SubscriptionGuard)
// @Get('reports')
// getReports() { ... }
```

---

## Environment Variables


```env
# App
APP_URL=http://localhost:3000
DATABASE_URL=postgresql://...
JWT_SECRET=...
PORT=3000

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Paystack
PAYSTACK_SECRET_KEY=sk_test_...
PAYSTACK_WEBHOOK_SECRET=...   # same as secret key for HMAC

# Redis (for BullMQ / cart caching)
REDIS_URL=redis://localhost:6379
```

---

## Local Dev Commands

```bash
# Install
npm i stripe axios @nestjs/config @prisma/client prisma

# Stripe webhook forwarding
stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe

# Prisma
npx prisma migrate dev --name init
npx prisma db seed   # seeds Plan table

# Docker (Postgres + Redis)
docker-compose up -d
```

---

## Agent Coding Task Order

If you're using Cursor, Windsurf, or Claude Code, work in this order:


```
1. prisma/schema.prisma           — schema first, everything depends on it
2. prisma/prisma.service.ts       — Prisma singleton
3. config/configuration.ts        — typed env
4. payment-providers/             — interface, then stripe, then paystack
5. auth/                          — JWT, standard
6. users/                         — basic CRUD
7. products/ + categories/        — catalog
8. discounts/                     — coupon validation logic
9. cart/                          — add/remove/apply discount
10. checkout/                     — order checkout + sub checkout (depends on cart + providers)
11. orders/                       — order state machine
12. plans/ + subscriptions/       — SaaS side
13. webhooks/                     — LAST, because it updates all the above
14. common/guards/                — SubscriptionGuard, RolesGuard
```
