import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { timingSafeEqual, createHmac } from 'crypto';
import configuration from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CancelSubscriptionParams,
  CheckoutSessionResult,
  CreateOrderCheckoutSessionParams,
  CreateSubscriptionCheckoutSessionParams,
  IPaymentProvider,
} from '../payment-provider.interface';

interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

interface PaystackErrorResponse {
  message?: string;
}

interface PaystackCustomerResponse {
  customer_code: string;
}

interface PaystackInitializeTransactionResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

@Injectable()
export class PaystackService implements IPaymentProvider, OnModuleInit {
  private http!: AxiosInstance;

  constructor(
    @Inject(configuration.KEY)
    private readonly appConfig: ConfigType<typeof configuration>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const secretKey = this.appConfig.paystack.secretKey;
    if (!secretKey) {
      throw new InternalServerErrorException(
        'PAYSTACK_SECRET_KEY is required to initialize Paystack',
      );
    }

    this.http = axios.create({
      baseURL: this.appConfig.paystack.baseUrl,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async ensureCustomer(userId: string, email: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (user.paystackCustomerId) {
      return user.paystackCustomerId;
    }

    const response = await this.post<PaystackCustomerResponse>('/customer', {
      email,
      metadata: { userId },
    });
    const customerCode = response.customer_code;

    await this.prisma.user.update({
      where: { id: userId },
      data: { paystackCustomerId: customerCode },
    });

    return customerCode;
  }

  async createOrderCheckoutSession(
    params: CreateOrderCheckoutSessionParams,
  ): Promise<CheckoutSessionResult> {
    const totalAmount = params.lineItems.reduce(
      (sum, item) => sum + item.unitAmount * item.quantity,
      0,
    );

    const response = await this.post<PaystackInitializeTransactionResponse>(
      '/transaction/initialize',
      {
        email: params.customerEmail,
        amount: totalAmount,
        currency: params.currency,
        callback_url: params.successUrl,
        metadata: {
          orderId: params.orderId,
          customerId: params.customerId,
          cancelUrl: params.cancelUrl,
          ...params.metadata,
        },
      },
    );

    return {
      sessionId: response.reference,
      url: response.authorization_url,
      providerRef: response.reference,
    };
  }

  async createSubscriptionCheckoutSession(
    params: CreateSubscriptionCheckoutSessionParams,
  ): Promise<CheckoutSessionResult> {
    const response = await this.post<PaystackInitializeTransactionResponse>(
      '/transaction/initialize',
      {
        email: params.customerEmail,
        plan: params.priceId,
        callback_url: params.successUrl,
        metadata: {
          customerId: params.customerId,
          cancelUrl: params.cancelUrl,
          ...params.metadata,
        },
      },
    );

    return {
      sessionId: response.reference,
      url: response.authorization_url,
      providerRef: response.reference,
    };
  }

  async createBillingPortalSession(
    _customerId: string,
    returnUrl: string,
  ): Promise<{ url: string }> {
    return { url: `${returnUrl.replace(/\/$/, '')}/billing` };
  }

  async cancelSubscription(params: CancelSubscriptionParams): Promise<void> {
    if (!params.providerSubscriptionToken) {
      throw new BadRequestException(
        'Paystack subscription cancellation requires the provider subscription token',
      );
    }

    await this.post('/subscription/disable', {
      code: params.providerSubscriptionId,
      token: params.providerSubscriptionToken,
    });
  }

  verifyWebhookSignature(payload: Buffer, signature: string): boolean {
    const secretKey = this.appConfig.paystack.secretKey;
    if (!secretKey) {
      return false;
    }

    const expectedSignature = createHmac('sha512', secretKey)
      .update(payload)
      .digest('hex');

    const actualBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  private async post<T = void>(path: string, payload: unknown): Promise<T> {
    try {
      const response = await this.http.post<PaystackEnvelope<T>>(path, payload);
      return response.data.data;
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  private toHttpException(error: unknown): Error {
    if (error instanceof AxiosError) {
      const responseData = error.response?.data as
        | PaystackErrorResponse
        | undefined;
      const message =
        responseData?.message ?? error.message ?? 'Paystack request failed';
      return new BadRequestException(message);
    }

    return error instanceof Error
      ? error
      : new BadRequestException('Paystack request failed');
  }
}
