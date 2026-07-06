import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiExcludeEndpoint,
  ApiBearerAuth,
  ApiCookieAuth,
} from '@nestjs/swagger';
import Stripe from 'stripe';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';
import {
  CheckoutDto,
  CartCheckoutDto,
  ConfirmCheckoutDto,
} from './dto/checkout.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly payments: PaymentsService,
    private readonly stripe: StripeService,
  ) {}

  /** Start a Stripe Checkout for a single course (destination charge). */
  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  @ApiOperation({ summary: 'Create a Stripe Checkout session for a course' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  async checkout(
    @CurrentUser() user: { userId: string },
    @Body() dto: CheckoutDto,
  ): Promise<{ url: string }> {
    return this.payments.checkout(user.userId, dto.courseId, dto.origin);
  }

  /**
   * Start a Stripe Checkout for the buyer's WHOLE cart (selected sections and/or
   * full courses, possibly across several instructors) in one session.
   */
  @UseGuards(JwtAuthGuard)
  @Post('checkout-cart')
  @ApiOperation({ summary: 'Create a Stripe Checkout session for the whole cart' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  async checkoutCart(
    @CurrentUser() user: { userId: string },
    @Body() dto: CartCheckoutDto,
  ): Promise<{ url: string }> {
    return this.payments.checkoutCart(user.userId, dto.origin);
  }

  /**
   * Confirm + fulfill a checkout from the return redirect (webhook-independent).
   * Idempotent — safe to call alongside the webhook.
   */
  @UseGuards(JwtAuthGuard)
  @Post('confirm')
  @ApiOperation({ summary: 'Confirm and fulfill a checkout session on return' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  async confirm(
    @CurrentUser() user: { userId: string },
    @Body() dto: ConfirmCheckoutDto,
  ): Promise<{ fulfilled: boolean }> {
    return this.payments.confirmCheckout(dto.sessionId, user.userId);
  }

  /**
   * Recover the caller's paid-but-unfulfilled orders (webhook-independent). Powers
   * the "Already paid? Sync my purchase" button. Idempotent.
   */
  @UseGuards(JwtAuthGuard)
  @Post('confirm-pending')
  @ApiOperation({ summary: 'Fulfill my paid-but-pending checkout orders' })
  @ApiCookieAuth('jwt')
  @ApiBearerAuth()
  async confirmPending(
    @CurrentUser() user: { userId: string },
  ): Promise<{ fulfilled: number }> {
    return this.payments.confirmPendingOrders(user.userId);
  }

  /** Stripe webhook. Raw body + signature verification. Always 200. */
  @SkipThrottle()
  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
    @Body() body: unknown,
  ): Promise<{ received: boolean }> {
    let event: Stripe.Event;
    try {
      const raw = req.rawBody ?? Buffer.from(JSON.stringify(body));
      event = this.stripe.constructEvent(raw, signature);
    } catch (err) {
      this.logger.warn(`Stripe webhook signature failed: ${(err as Error).message}`);
      // Do not 500 — a bad signature is a client problem. 200 avoids retries loop
      // in dev; Stripe treats non-2xx as retryable, so we return 200 + received:false.
      return { received: false };
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await this.payments.fulfillCheckout(
            event.data.object as Stripe.Checkout.Session,
          );
          break;
        case 'payout.paid':
        case 'payout.failed':
          await this.payments.applyPayoutWebhook(
            event.data.object as Stripe.Payout,
          );
          break;
        case 'charge.dispute.created':
          await this.payments.handleDisputeCreated(
            event.data.object as Stripe.Dispute,
          );
          break;
        case 'charge.dispute.closed':
          await this.payments.handleDisputeClosed(
            event.data.object as Stripe.Dispute,
          );
          break;
        case 'account.updated':
          // Onboarding state changes are read on demand via /earnings/connect/status.
          break;
        default:
          break;
      }
    } catch (err) {
      this.logger.error(
        `Stripe webhook handler error for ${event.type}: ${(err as Error).message}`,
      );
    }
    return { received: true };
  }
}
