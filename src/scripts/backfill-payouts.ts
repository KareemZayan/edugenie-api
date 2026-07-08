import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PaymentsService } from '../payments/payments.service';

/**
 * One-off backfill: reconcile historical Stripe `paid` payouts into PAID_OUT
 * earnings for instructors whose earnings predate the payout.paid webhook wiring.
 *
 * Usage (from edugenie-api/):
 *   npm run backfill:payouts -- --dry               # preview, writes nothing
 *   npm run backfill:payouts                         # apply
 *   npm run backfill:payouts -- --instructor <id>    # limit to one instructor
 *   npm run backfill:payouts -- --notify             # also send "payout completed" notifications
 *
 * Idempotent + re-runnable (earnings already stamped with a payout id are skipped).
 * Requires STRIPE_SECRET_KEY (test mode) in the environment.
 */
async function bootstrap() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry') || args.includes('--dry-run');
  const notify = args.includes('--notify');
  const idFlag = args.indexOf('--instructor');
  const instructorId = idFlag >= 0 ? args[idFlag + 1] : undefined;

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const payments = app.get(PaymentsService);
    console.log(
      `\nBackfilling Stripe payouts → PAID_OUT earnings${dryRun ? ' (DRY RUN)' : ''}` +
        `${instructorId ? ` for instructor ${instructorId}` : ''}...\n`,
    );

    const summary = await payments.backfillPaidPayouts({
      dryRun,
      notify,
      instructorId,
    });

    for (const row of summary.perInstructor) {
      if (row.settled > 0) {
        console.log(
          `  ${row.instructorId}  (${row.accountId})  payouts=${row.payouts}  ` +
            `settled=${row.settled}  amount=${row.amount.toFixed(2)}`,
        );
      }
    }

    console.log('\n─── Summary ───────────────────────────────');
    console.log(`  Mode:              ${dryRun ? 'DRY RUN (no writes)' : 'APPLIED'}`);
    console.log(`  Instructors:       ${summary.instructors}`);
    console.log(`  Stripe payouts:    ${summary.payoutsSeen}`);
    console.log(`  Earnings settled:  ${summary.earningsSettled}`);
    console.log(`  Amount settled:    ${summary.amountSettled.toFixed(2)}`);
    console.log('───────────────────────────────────────────\n');
  } catch (err) {
    console.error('Backfill failed:', (err as Error).message);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void bootstrap();
