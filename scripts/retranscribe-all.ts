/**
 * One-off: re-transcribe every PUBLISHED lesson video with the new segmented
 * (time-coded) Gemini prompt, then re-embed. Runs through the real service
 * (CloudinaryService.transcribeAndSave) inside a standalone Nest context, so
 * storage + RAG indexing happen exactly as they do in production.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/retranscribe-all.ts
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../src/app.module';
import { Course } from '../src/courses/schema/course.schema';
import { CourseStatus } from '../src/common/enums/course-status.enum';
import { CloudinaryService } from '../src/cloudinary/cloudinary.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const courseModel = app.get<Model<Course>>(getModelToken(Course.name));
  const cloud = app.get(CloudinaryService);

  const courses = await courseModel
    .find({ courseStatus: CourseStatus.PUBLISHED })
    .select('title sections')
    .lean<
      Array<{
        title: string;
        sections?: Array<{ lessons?: Array<{ title: string; videoPublicId?: string }> }>;
      }>
    >();

  const jobs: { publicId: string; label: string }[] = [];
  for (const c of courses)
    for (const s of c.sections ?? [])
      for (const l of s.lessons ?? [])
        if (l.videoPublicId)
          jobs.push({ publicId: l.videoPublicId, label: `${c.title} / ${l.title}` });

  // Inline audio is token-heavy; Gemini's free-tier per-minute token quota 429s
  // if calls fire back-to-back. Space them out and retry failures after a longer
  // cool-off so the whole set eventually lands.
  const DELAY_MS = Number(process.env.RT_DELAY_MS ?? 45_000);
  const RETRY_WAIT_MS = Number(process.env.RT_RETRY_WAIT_MS ?? 65_000);
  const MAX_RETRIES = Number(process.env.RT_MAX_RETRIES ?? 3);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const statusOf = async (publicId: string): Promise<string> => {
    const doc = await courseModel
      .findOne(
        { 'sections.lessons.videoPublicId': publicId },
        { 'sections.lessons.$': 1 },
      )
      .lean<{ sections?: Array<{ lessons?: Array<{ transcriptStatus?: string; transcriptSegments?: unknown[] }> }> }>();
    const l = doc?.sections?.[0]?.lessons?.[0];
    const segs = Array.isArray(l?.transcriptSegments) ? l!.transcriptSegments!.length : 0;
    return `${l?.transcriptStatus ?? '-'}(seg:${segs})`;
  };

  console.log(`Re-transcribing ${jobs.length} published lessons (delay ${DELAY_MS}ms)...\n`);
  let ok = 0;
  let fail = 0;
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    let done = false;
    for (let attempt = 1; attempt <= MAX_RETRIES && !done; attempt++) {
      process.stdout.write(
        `[${i + 1}/${jobs.length}] (try ${attempt}) ${j.label} ... `,
      );
      await cloud.transcribeAndSave(j.publicId, true); // swallows errors internally
      const st = await statusOf(j.publicId);
      console.log(st);
      if (st.startsWith('ready')) {
        done = true;
        ok++;
      } else if (attempt < MAX_RETRIES) {
        await sleep(RETRY_WAIT_MS);
      }
    }
    if (!done) fail++;
    if (i < jobs.length - 1) await sleep(DELAY_MS);
  }
  console.log(`\nDONE ok=${ok} fail=${fail}`);
  await app.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
