import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * Thin wrapper around the Stripe SDK for the Connect (Express) marketplace demo.
 * TEST MODE ONLY. Degrades gracefully: when STRIPE_SECRET_KEY is unset the
 * client is null and `isConfigured` is false, so callers can 503 instead of
 * crashing (mirrors how the old PayPal provider behaved).
 *
 * Money model: destination charges. The platform creates the Checkout Session,
 * takes `application_fee_amount` (its commission), and `transfer_data.destination`
 * routes the remainder into the instructor's connected-account balance. The
 * instructor later pays that balance out to their (test) bank account.
 *
 * The whole demo runs in one currency to avoid Stripe's per-country currency
 * rules — course `price` (a plain number) is charged as USD cents.
 */
export const STRIPE_CURRENCY = 'usd';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly client: Stripe | null;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    const secret = this.config.get<string>('STRIPE_SECRET_KEY') || '';
    this.webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET') || '';
    this.client = secret ? new Stripe(secret) : null;
  }

  get isConfigured(): boolean {
    return !!this.client;
  }

  private require(): Stripe {
    if (!this.client) {
      throw new Error('Stripe is not configured (set STRIPE_SECRET_KEY).');
    }
    return this.client;
  }

  /** Create an Express connected account. `country` is an ISO-2 (default US). */
  async createExpressAccount(email?: string, country = 'US'): Promise<string> {
    const account = await this.require().accounts.create({
      type: 'express',
      country,
      email: email || undefined,
      capabilities: { transfers: { requested: true } },
    });
    return account.id;
  }

  /**
   * Put the connected account on an AUTOMATIC daily payout schedule with a
   * settlement delay (dispute-protection buffer). Stripe then pays the
   * instructor's available balance out to their bank on its own — no manual
   * payout call, no admin approval. Safe to call repeatedly (idempotent update).
   */
  async setAutomaticPayoutSchedule(
    accountId: string,
    delayDays: number,
  ): Promise<void> {
    await this.require().accounts.update(accountId, {
      settings: {
        payouts: {
          schedule: { interval: 'daily', delay_days: delayDays },
        },
      },
    });
  }

  /** One-time login link to the instructor's Stripe Express dashboard. */
  async createLoginLink(accountId: string): Promise<string> {
    const link = await this.require().accounts.createLoginLink(accountId);
    return link.url;
  }

  /** Hosted onboarding link. `refreshUrl`/`returnUrl` bounce back to the app. */
  async createAccountLink(
    accountId: string,
    refreshUrl: string,
    returnUrl: string,
  ): Promise<string> {
    const link = await this.require().accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });
    return link.url;
  }

  async retrieveAccount(accountId: string): Promise<Stripe.Account> {
    return this.require().accounts.retrieve(accountId);
  }

  /** Destination-charge Checkout Session: platform charges, fee kept, rest transferred. */
  async createCheckoutSession(params: {
    courseTitle: string;
    priceCents: number;
    feeCents: number;
    destinationAccountId: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<Stripe.Checkout.Session> {
    return this.require().checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: STRIPE_CURRENCY,
              unit_amount: params.priceCents,
              product_data: { name: params.courseTitle },
            },
          },
        ],
        payment_intent_data: {
          application_fee_amount: params.feeCents,
          transfer_data: { destination: params.destinationAccountId },
        },
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: params.metadata,
      },
      { idempotencyKey: params.idempotencyKey },
    );
  }

  /**
   * Whole-cart Checkout Session using the "separate charges and transfers" model:
   * the PLATFORM is the merchant (no transfer_data/destination), so ONE session
   * can hold items from multiple instructors. Funds land on the platform balance;
   * fulfillment then issues one Transfer per instructor (see createTransfer). A
   * shared `transferGroup` ties those transfers back to this charge.
   */
  async createCartCheckoutSession(params: {
    lineItems: Array<{ name: string; amountCents: number }>;
    transferGroup: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<Stripe.Checkout.Session> {
    return this.require().checkout.sessions.create(
      {
        mode: 'payment',
        line_items: params.lineItems.map((li) => ({
          quantity: 1,
          price_data: {
            currency: STRIPE_CURRENCY,
            unit_amount: li.amountCents,
            product_data: { name: li.name },
          },
        })),
        payment_intent_data: {
          transfer_group: params.transferGroup,
          metadata: params.metadata,
        },
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: params.metadata,
      },
      { idempotencyKey: params.idempotencyKey },
    );
  }

  /**
   * Transfer an instructor's share from the platform balance to their connected
   * account, drawn from the specific charge (`source_transaction`) so it settles
   * with those funds rather than needing a pre-funded platform balance. Idempotent
   * per `idempotencyKey` so a replayed webhook can't double-pay.
   */
  async createTransfer(params: {
    destinationAccountId: string;
    amountCents: number;
    transferGroup: string;
    sourceTransaction: string;
    idempotencyKey: string;
  }): Promise<Stripe.Transfer> {
    return this.require().transfers.create(
      {
        amount: params.amountCents,
        currency: STRIPE_CURRENCY,
        destination: params.destinationAccountId,
        transfer_group: params.transferGroup,
        source_transaction: params.sourceTransaction,
      },
      { idempotencyKey: params.idempotencyKey },
    );
  }

  /** Retrieve a Checkout Session — used to confirm/fulfill on the return redirect. */
  async retrieveCheckoutSession(
    sessionId: string,
  ): Promise<Stripe.Checkout.Session> {
    return this.require().checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent'],
    });
  }

  /** The charge id backing a PaymentIntent (needed as a transfer source). */
  async getChargeId(paymentIntentId: string): Promise<string | null> {
    try {
      const pi = await this.require().paymentIntents.retrieve(paymentIntentId);
      const charge = pi.latest_charge;
      return typeof charge === 'string' ? charge : (charge?.id ?? null);
    } catch {
      return null;
    }
  }

  /** Connected-account balance (available + pending), summed in STRIPE_CURRENCY. */
  async getConnectedBalance(
    accountId: string,
  ): Promise<{ available: number; pending: number }> {
    const balance = await this.require().balance.retrieve(
      {},
      { stripeAccount: accountId },
    );
    const sum = (arr: Stripe.Balance.Available[] | Stripe.Balance.Pending[]) =>
      arr
        .filter((b) => b.currency === STRIPE_CURRENCY)
        .reduce((s, b) => s + b.amount, 0);
    return {
      available: sum(balance.available) / 100,
      pending: sum(balance.pending) / 100,
    };
  }

  /** Pay a connected account's balance out to its bank. Idempotent per requestId. */
  async createPayout(
    accountId: string,
    amountCents: number,
    idempotencyKey: string,
  ): Promise<Stripe.Payout> {
    return this.require().payouts.create(
      { amount: amountCents, currency: STRIPE_CURRENCY },
      { stripeAccount: accountId, idempotencyKey },
    );
  }

  async retrievePayout(
    accountId: string,
    payoutId: string,
  ): Promise<Stripe.Payout> {
    return this.require().payouts.retrieve(payoutId, undefined, {
      stripeAccount: accountId,
    });
  }

  /**
   * The Stripe processing fee for a PaymentIntent, in major units (e.g. dollars).
   * Reads the balance transaction on the latest charge. Returns 0 if unavailable.
   */
  async getPaymentFee(paymentIntentId: string): Promise<number> {
    try {
      const pi = await this.require().paymentIntents.retrieve(paymentIntentId, {
        expand: ['latest_charge.balance_transaction'],
      });
      const charge = pi.latest_charge;
      if (charge && typeof charge !== 'string') {
        const bt = charge.balance_transaction;
        if (bt && typeof bt !== 'string') return (bt.fee ?? 0) / 100;
      }
    } catch {
      /* fee not available yet — best effort */
    }
    return 0;
  }

  /** Retrieve a charge (used to find the destination transfer on a dispute). */
  async retrieveCharge(chargeId: string): Promise<Stripe.Charge> {
    return this.require().charges.retrieve(chargeId);
  }

  /**
   * Reverse the destination transfer for a charge — claws the instructor's share
   * back to the platform (used when a dispute is lost). Idempotent-ish: Stripe
   * rejects a second full reversal, so callers should guard on state.
   */
  async reverseTransfer(transferId: string): Promise<Stripe.TransferReversal> {
    return this.require().transfers.createReversal(transferId);
  }

  /** Verify + parse a webhook. Throws if the signature/secret don't match. */
  constructEvent(rawBody: string | Buffer, signature: string): Stripe.Event {
    return this.require().webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );
  }
}
