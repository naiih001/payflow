export interface CheckoutLineItem {
  name: string;
  unitAmount: number;
  quantity: number;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string;
  providerRef: string;
}

export interface CreateOrderCheckoutSessionParams {
  orderId: string;
  lineItems: CheckoutLineItem[];
  currency: string;
  customerId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CreateSubscriptionCheckoutSessionParams {
  priceId: string;
  customerId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CancelSubscriptionParams {
  providerSubscriptionId: string;
  providerSubscriptionToken?: string;
}

export interface IPaymentProvider {
  createOrderCheckoutSession(
    params: CreateOrderCheckoutSessionParams,
  ): Promise<CheckoutSessionResult>;

  createSubscriptionCheckoutSession(
    params: CreateSubscriptionCheckoutSessionParams,
  ): Promise<CheckoutSessionResult>;

  createBillingPortalSession(
    customerId: string,
    returnUrl: string,
  ): Promise<{ url: string }>;

  cancelSubscription(params: CancelSubscriptionParams): Promise<void>;

  ensureCustomer(userId: string, email: string): Promise<string>;
}
