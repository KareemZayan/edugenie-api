# Stripe Connect marketplace demo (TEST MODE)

End-to-end money flow using **Stripe Connect (Express) + destination charges** —
fake money only. Student pays → platform keeps its commission → the instructor's
share lands in their Stripe connected-account balance → instructor requests a
payout → superadmin approves → Stripe pays it out to a test bank account.

> Paymob and PayPal were removed — Stripe is the only payments system now.

## Required env vars (`edugenie-api/.env`) — TEST keys only

```
STRIPE_SECRET_KEY=sk_test_...          # Stripe Dashboard → Developers → API keys (test mode)
STRIPE_WEBHOOK_SECRET=whsec_...        # printed by `stripe listen` (below)
STRIPE_CONNECT_CLIENT_ID=ca_...        # optional; not needed for Express onboarding
```

All optional: without `STRIPE_SECRET_KEY` the payment/payout endpoints return
503 but the app still boots. Currency is **USD** for the whole demo (a course's
`price` number is charged as USD cents); the commission is `platformFeePercent`
from the superadmin platform-config.

## Run it locally

1. **Backend** (`edugenie-api`): set the env vars, then `npm run start:dev` (port 5000).
2. **Stripe webhook forwarder** (Stripe CLI, logged in with `stripe login`):
   ```
   stripe listen --forward-to localhost:5000/api/payments/webhook
   ```
   Copy the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET` and restart the API.
3. **Dashboard** (`edugenie-dashboard`): `npm start` (port 4200).

## Endpoints added

| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| POST | `/api/earnings/connect/onboard` | instructor | Create Express account + return onboarding link |
| GET  | `/api/earnings/connect/status`  | instructor | Onboarding + balance status |
| POST | `/api/payments/checkout`        | any logged-in | Create a Checkout Session (destination charge) |
| POST | `/api/payments/webhook`         | Stripe | `checkout.session.completed`, `payout.paid/failed` |
| POST | `/api/earnings/request-payout`  | instructor | Open a payout request (PENDING) |
| PATCH| `/api/superadmin/payouts/:id/approve` | superadmin | Fire the Stripe payout (→ PROCESSING) |
| PATCH| `/api/superadmin/payouts/:id/sync`    | superadmin | Poll Stripe → Paid/Failed |

## Demo script (exact clicks + test data)

1. **Onboard the instructor.** Dashboard → log in as an instructor → **Earnings**
   → **Set up payouts (Stripe)** → complete Stripe Express onboarding with test data:
   - Phone OTP: `000 000`
   - Any test person/company details Stripe prefills
   - **Test bank account:** routing `110000000`, account `000123456789`
   Finish → you land on **/stripe-callback** showing **Payouts enabled**.
2. **Buy a course (as a different account).** Log in as another user (not the course's
   instructor) → sidebar **Buy (test)** → pick a published course → **Buy (test)** →
   Stripe Checkout → card **`4242 4242 4242 4242`**, any future expiry, any CVC, any ZIP → pay.
   The `checkout.session.completed` webhook records the Order + Enrollment + Earning.
3. **See the earnings.** Log back in as the instructor → **Earnings**: the Stripe
   **Available** balance shows the instructor share and the sale appears in history.
4. **Request a payout.** **Earnings → Request payout** (needs pending ≥ minimum
   threshold from platform-config). Creates a PENDING request.
5. **Approve it.** Log in as **superadmin** → **/admin/payouts** → **Approve** → the
   request goes **PROCESSING** (Stripe payout created; `gatewayReference` = payout id).
6. **Confirm Paid.** Click **Check Stripe status** (polls Stripe) — or trigger the
   webhook with `stripe trigger payout.paid`. The request becomes **APPROVED** and the
   instructor's earnings flip to **PAID_OUT**.

### Verify the money in Stripe
Stripe Dashboard (test mode) → **Connect → Accounts** → the instructor's account →
**Payments** (the destination charge) and **Payouts** (the bank payout). The
platform's commission shows on the main account as the application fee.

## Notes / gotchas
- **Self-buy is blocked** — an instructor can't buy their own course (that's why the
  demo needs a second account as the buyer).
- If a payout fails with *insufficient funds*, the destination-charge funds haven't
  settled into the connected balance yet; retry the approve, or buy again to top it up.
- Everything is **test mode** — never put live keys here.
