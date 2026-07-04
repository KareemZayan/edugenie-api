// Diagnostic: transcribe an already-uploaded lesson video via Gemini and PRINT
// the result. READ-ONLY against the DB by default (MONGO_URI is production) —
// use --save (opt-in) to write the transcript back onto ONE lesson.
//
//   node scripts/test-gemini-transcript.mjs                  # auto-pick 1 lesson from DB
//   node scripts/test-gemini-transcript.mjs --limit 3        # try 3 lessons
//   node scripts/test-gemini-transcript.mjs --course <id>    # only this course's lessons
//   node scripts/test-gemini-transcript.mjs --public-id <id> # skip DB entirely
//   node scripts/test-gemini-transcript.mjs --public-id <id> --save   # also persist (prod write!)
//
// Reads GEMINI_API_KEY / GEMINI_TRANSCRIBE_MODEL / CLOUDINARY_CLOUD_NAME / MONGO_URI
// from .env. Never logs secret values.
import 'dotenv/config';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? true) : undefined;
};
const has = (name) => args.includes(name);

const CLOUD = process.env.CLOUDINARY_CLOUD_NAME;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-flash-latest';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const PROMPT =
  'You are a transcription engine. Transcribe the spoken audio verbatim into ' +
  'plain text. Output ONLY the transcript — no preamble, timestamps, speaker ' +
  'labels, or commentary. If there is no intelligible speech, output nothing.';

const publicIdArg = flag('--public-id');
const courseArg = flag('--course');
const limit = Number(flag('--limit') || 1);
const save = has('--save');

if (!CLOUD) fail('CLOUDINARY_CLOUD_NAME missing in .env');
if (!GEMINI_KEY) fail('GEMINI_API_KEY missing in .env');

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// Mirror of CloudinaryService.audioUrlFor
function audioUrlFor(publicId) {
  const path = publicId
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `https://res.cloudinary.com/${CLOUD}/video/upload/f_mp3,br_64k/${path}.mp3`;
}

// Mirror of GeminiTranscriptionProvider.extractText
function extractText(json) {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts
      .map((p) => (typeof p?.text === 'string' ? p.text : ''))
      .join('')
      .trim();
  }
  return (json?.candidates?.[0]?.content?.text ?? json?.text ?? '').trim();
}

async function transcribeOne({ title, lessonId, courseId, publicId }) {
  console.log('\n────────────────────────────────────────────────────────');
  console.log(
    `Lesson : ${title ?? '(unknown)'}${lessonId ? `  [${lessonId}]` : ''}`,
  );
  console.log(`publicId: ${publicId}`);
  const audioUrl = audioUrlFor(publicId);
  console.log(`audio  : ${audioUrl}`);

  // 1) fetch audio
  const t0 = Date.now();
  let audioRes;
  try {
    audioRes = await fetch(audioUrl);
  } catch (e) {
    console.error(`✗ audio fetch threw: ${e?.message || e}`);
    return null;
  }
  if (!audioRes.ok) {
    const body = await audioRes.text().catch(() => '');
    console.error(`✗ audio fetch ${audioRes.status} — ${body.slice(0, 200)}`);
    console.error(
      audioRes.status === 423 || audioRes.status === 401
        ? '  → Cloudinary is blocking the f_mp3 derived transform for this account.'
        : '',
    );
    return null;
  }
  const buf = Buffer.from(await audioRes.arrayBuffer());
  const mb = (buf.length / 1024 / 1024).toFixed(2);
  console.log(
    `✓ audio ${audioRes.status}  ${mb} MB  (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );

  // 2) Gemini transcribe
  const t1 = Date.now();
  const body = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: 'audio/mpeg',
              data: buf.toString('base64'),
            },
          },
          { text: PROMPT },
        ],
      },
    ],
  };
  let gRes;
  try {
    gRes = await fetch(`${GEMINI_BASE}/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_KEY,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error(`✗ Gemini request threw: ${e?.message || e}`);
    return null;
  }
  if (!gRes.ok) {
    const b = await gRes.text().catch(() => '');
    console.error(
      `✗ Gemini ${gRes.status} (model=${MODEL}) — ${b.slice(0, 300)}`,
    );
    console.error(
      gRes.status === 404
        ? '  → model id not available; set GEMINI_TRANSCRIBE_MODEL to a current Flash id.'
        : gRes.status === 429
          ? '  → free-tier rate/quota limit; retry later.'
          : '',
    );
    return null;
  }
  const json = await gRes.json();
  const text = extractText(json);
  console.log(
    `✓ Gemini ${gRes.status}  (${((Date.now() - t1) / 1000).toFixed(1)}s)  model=${MODEL}`,
  );
  console.log(`transcript: ${text.length} chars`);
  console.log('─── first 600 chars ───');
  console.log(text ? text.slice(0, 600) : '(empty — no intelligible speech?)');
  return { text, courseId, publicId };
}

async function main() {
  let targets = [];

  if (publicIdArg && typeof publicIdArg === 'string') {
    targets = [{ publicId: publicIdArg }];
  } else {
    // Read candidate lessons from the DB (read-only).
    const { MongoClient } = await import('mongodb');
    const uri = process.env.MONGO_URI;
    if (!uri)
      fail(
        'MONGO_URI missing in .env (or pass --public-id <id> to skip the DB)',
      );
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    try {
      await client.connect();
    } catch (e) {
      console.error(`✗ Mongo connect failed: ${e?.message || e}`);
      console.error(
        '  → Atlas may block this IP. Allowlist it, run from Windows, or use --public-id <id>.',
      );
      process.exit(1);
    }
    const db = client.db();
    const query = courseArg ? { _id: await toId(courseArg) } : {};
    const courses = await db
      .collection('courses')
      .find(query, { projection: { title: 1, sections: 1 } })
      .toArray();
    for (const c of courses) {
      for (const s of c.sections ?? []) {
        for (const l of s.lessons ?? []) {
          if (l.videoPublicId) {
            targets.push({
              title: l.title,
              lessonId: String(l._id),
              courseId: String(c._id),
              publicId: l.videoPublicId,
              hasTranscript: !!l.transcript,
            });
          }
        }
      }
    }
    await client.close();
    // Prefer lessons without a transcript, then cap to --limit.
    targets.sort((a, b) => Number(a.hasTranscript) - Number(b.hasTranscript));
    console.log(
      `Found ${targets.length} lesson(s) with a video; testing ${Math.min(limit, targets.length)}.`,
    );
    targets = targets.slice(0, limit);
  }

  if (targets.length === 0) fail('No lessons with a videoPublicId found.');

  const results = [];
  for (const t of targets) {
    const r = await transcribeOne(t);
    if (r) results.push(r);
  }

  if (save) {
    if (!results.length) fail('--save: nothing transcribed to save.');
    const { MongoClient, ObjectId } = await import('mongodb');
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    const db = client.db();
    for (const r of results) {
      if (!r.text) {
        console.log(`(skip save — empty transcript for ${r.publicId})`);
        continue;
      }
      const res = await db.collection('courses').updateOne(
        { 'sections.lessons.videoPublicId': r.publicId },
        {
          $set: {
            'sections.$[].lessons.$[l].transcript': r.text,
            'sections.$[].lessons.$[l].transcriptStatus': 'ready',
          },
        },
        { arrayFilters: [{ 'l.videoPublicId': r.publicId }] },
      );
      console.log(`💾 saved ${r.publicId} → modified ${res.modifiedCount}`);
    }
    await client.close();
    console.log('⚠ NOTE: --save wrote to the production DB.');
  }

  console.log('\n✓ done.');
}

async function toId(id) {
  const { ObjectId } = await import('mongodb');
  return new ObjectId(id);
}

main().catch((e) => {
  console.error('✗ Error:', e?.message || e);
  process.exit(1);
});
