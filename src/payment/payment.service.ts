import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { getErrorMessage } from '../utils';

/** Needs USD enabled on the Paystack account. */
const PAYSTACK_CURRENCY = 'USD';

export interface InitializePaymentOptions {
  email: string;
  amount: number; // Amount in USD (converted to cents automatically)
  reference?: string;
  callbackUrl?: string;
  channels?: string[];
  metadata?: Record<string, unknown>;
}

export interface PaystackInitResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    id: number;
    domain: string;
    status: 'success' | 'failed' | 'abandoned' | string;
    reference: string;
    amount: number; // Amount in cents
    message: string | null;
    gateway_response: string;
    paid_at: string;
    created_at: string;
    channel: string;
    currency: string;
    ip_address: string;
    metadata: Record<string, unknown>;
    customer: {
      id: number;
      first_name: string;
      last_name: string;
      email: string;
      customer_code: string;
      phone: string | null;
    };
    authorization: {
      authorization_code: string;
      bin: string;
      last4: string;
      exp_month: string;
      exp_year: string;
      channel: string;
      card_type: string;
      bank: string;
      country_code: string;
      brand: string;
      reusable: boolean;
      signature: string;
    };
  };
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly baseUrl = 'https://api.paystack.co';
  private readonly secretKey: string;

  constructor() {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      throw new Error(
        'PAYSTACK_SECRET_KEY environment variable is not configured',
      );
    }
    this.secretKey = secretKey;
  }

  /**
   * Helper headers for Paystack HTTP requests
   */
  private getHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Initialize a Paystack payment transaction
   * @param options Payment initialization options (email, amount in USD, etc.)
   * @returns Authorization URL and reference to complete payment
   */
  async initializePayment(
    options: InitializePaymentOptions,
  ): Promise<PaystackInitResponse['data']> {
    try {
      // Paystack expects the amount in the currency subunit (cents)
      const amountInCents = Math.round(options.amount * 100);

      const payload = {
        email: options.email,
        amount: amountInCents,
        currency: PAYSTACK_CURRENCY,
        reference: options.reference,
        callback_url: options.callbackUrl || process.env.PAYSTACK_CALLBACK_URL,
        channels: options.channels,
        metadata: options.metadata,
      };

      const response = await fetch(`${this.baseUrl}/transaction/initialize`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload),
      });

      const data: PaystackInitResponse = await response.json();

      if (!response.ok || !data.status) {
        this.logger.error(`❌ Paystack initialization error: ${data.message}`);
        throw new BadRequestException(
          data.message || 'Failed to initialize payment transaction',
        );
      }

      this.logger.log(`💳 Payment initialized: Ref ${data.data.reference}`);
      return data.data;
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error('Error initializing Paystack transaction:', message);
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        message || 'Payment initialization failed',
      );
    }
  }

  /**
   * Verify a Paystack payment transaction by its reference
   * @param reference Unique transaction reference string
   * @returns Verified transaction data
   */
  async verifyPayment(
    reference: string,
  ): Promise<PaystackVerifyResponse['data']> {
    if (!reference) {
      throw new BadRequestException('Transaction reference is required');
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        },
      );

      const data: PaystackVerifyResponse = await response.json();

      if (!response.ok || !data.status) {
        this.logger.error(`❌ Paystack verification error: ${data.message}`);
        throw new BadRequestException(
          data.message || 'Failed to verify transaction',
        );
      }

      this.logger.log(
        `✅ Transaction ${reference} status: ${data.data.status} (Amount: $${data.data.amount / 100})`,
      );
      return data.data;
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      this.logger.error('Error verifying Paystack transaction:', message);
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException(
        message || 'Payment verification failed',
      );
    }
  }

  /**
   * Verify incoming Paystack Webhook event signature
   * @param signature The 'x-paystack-signature' header value
   * @param body The raw request payload body string/buffer
   * @returns boolean indicating if the webhook is genuine
   */
  verifyWebhookSignature(signature: string, body: unknown): boolean {
    if (!signature || !this.secretKey) {
      return false;
    }

    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const hash = createHmac('sha512', this.secretKey)
      .update(payload)
      .digest('hex');

    const hashBuffer = Buffer.from(hash, 'hex');
    const signatureBuffer = Buffer.from(signature, 'hex');

    if (hashBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return timingSafeEqual(hashBuffer, signatureBuffer);
  }
}
