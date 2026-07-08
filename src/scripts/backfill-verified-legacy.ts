import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { User } from '../users/schema/user.schema';

/**
 * One-off backfill: mark LEGACY accounts as email-verified so the new login
 * `isVerified` gate doesn't lock out users who registered before email
 * verification existed.
 *
 * SAFETY — who is targeted (all conditions must hold):
 *   1. isVerified !== true          — not already verified
 *   2. emailVerification ABSENT     — no pending verification subdoc. A genuine
 *                                     new unverified signup ALWAYS has this
 *                                     subdoc set, so it is never touched. Only
 *                                     pre-feature legacy rows (that never had
 *                                     the field) match.
 *   3. createdAt < cutoff  (only if --before is passed) — extra belt.
 *
 * Google / invited / seeded accounts are isVerified:true, so condition (1)
 * already excludes them.
 *
 * Usage (from edugenie-api/):
 *   npm run backfill:verified                       # DRY RUN (default) — writes nothing
 *   npm run backfill:verified -- --before 2026-01-01 # DRY RUN, also require createdAt < date
 *   npm run backfill:verified -- --sample 50         # DRY RUN, print up to 50 sample rows
 *   npm run backfill:verified -- --apply             # ACTUALLY write isVerified=true
 *   npm run backfill:verified -- --apply --before 2026-01-01
 *
 * Writes NOTHING unless --apply is passed. Idempotent + re-runnable.
 */
async function bootstrap() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const beforeFlag = args.indexOf('--before');
  const beforeRaw = beforeFlag >= 0 ? args[beforeFlag + 1] : undefined;
  const sampleFlag = args.indexOf('--sample');
  const sampleSize =
    sampleFlag >= 0 ? Number(args[sampleFlag + 1]) || 20 : 20;

  let cutoff: Date | undefined;
  if (beforeRaw) {
    cutoff = new Date(beforeRaw);
    if (Number.isNaN(cutoff.getTime())) {
      console.error(`Invalid --before date: "${beforeRaw}" (use ISO, e.g. 2026-01-01)`);
      process.exitCode = 1;
      return;
    }
  }

  // Legacy-only filter: unverified AND no pending verification subdoc (+ cutoff).
  const filter: Record<string, unknown> = {
    isVerified: { $ne: true },
    emailVerification: { $exists: false },
  };
  if (cutoff) {
    filter.createdAt = { $lt: cutoff };
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const userModel = app.get<Model<User>>(getModelToken(User.name), {
      strict: false,
    });

    console.log(
      `\nBackfill legacy isVerified${apply ? ' (APPLY — will write)' : ' (DRY RUN — no writes)'}` +
        `${cutoff ? ` for accounts created before ${cutoff.toISOString()}` : ''}...\n`,
    );
    console.log('  Filter:', JSON.stringify(filter));

    const total = await userModel.countDocuments(filter);
    console.log(`  Matching legacy accounts: ${total}\n`);

    const sample = await userModel
      .find(filter)
      .select('_id email role isVerified createdAt')
      .sort({ createdAt: 1 })
      .limit(sampleSize)
      .lean();

    if (sample.length) {
      console.log(`  Sample (up to ${sampleSize}):`);
      for (const u of sample) {
        const created =
          (u as { createdAt?: Date }).createdAt?.toISOString() ?? 'n/a';
        console.log(
          `    ${String(u._id)}  ${u.email}  role=${u.role}  isVerified=${u.isVerified}  createdAt=${created}`,
        );
      }
      console.log('');
    }

    if (!apply) {
      console.log('─── DRY RUN — nothing written. ───────────────');
      console.log(`  Would set isVerified=true on ${total} account(s).`);
      console.log('  Re-run with --apply to write.');
      console.log('──────────────────────────────────────────────\n');
      return;
    }

    const result = await userModel.updateMany(filter, {
      $set: { isVerified: true },
    });
    console.log('─── APPLIED ──────────────────────────────────');
    console.log(`  Matched:  ${result.matchedCount}`);
    console.log(`  Modified: ${result.modifiedCount}`);
    console.log('──────────────────────────────────────────────\n');
  } catch (err) {
    console.error('Backfill failed:', (err as Error).message);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void bootstrap();
