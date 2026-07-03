// Create the Atlas Vector Search indexes that back RAG retrieval when
// RAG_USE_VECTOR_SEARCH=true.
//
//   node scripts/create-vector-indexes.mjs
//
// Reads MONGO_URI from .env. Idempotent — skips an index that already exists.
// Requires a MongoDB Atlas cluster whose tier supports Vector Search (createSearchIndex
// is an Atlas-only operation; it will fail against a local mongod). After this
// finishes and the indexes report "READY" in the Atlas UI, set
// RAG_USE_VECTOR_SEARCH=true and restart the API.
//
// numDimensions MUST match EMBEDDINGS_PROVIDER.dims (Gemini gemini-embedding-001
// at 768 via Matryoshka). If you change the embedding model/dims, drop and
// recreate these indexes (and re-embed).

import 'dotenv/config';
import { MongoClient } from 'mongodb';

const DIMS = 768;

// Mongoose default collection names for the ContentChunk / CourseCard models.
const INDEXES = [
  {
    collection: 'contentchunks',
    name: 'content_chunk_vector_index',
    definition: {
      fields: [
        { type: 'vector', path: 'embedding', numDimensions: DIMS, similarity: 'cosine' },
        // Pre-filter fields — access control is applied INSIDE the vector query.
        { type: 'filter', path: 'courseId' },
        { type: 'filter', path: 'lessonId' },
        { type: 'filter', path: 'sectionId' },
      ],
    },
  },
  {
    collection: 'coursecards',
    name: 'course_card_vector_index',
    definition: {
      fields: [
        { type: 'vector', path: 'embedding', numDimensions: DIMS, similarity: 'cosine' },
      ],
    },
  },
];

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('✗ MONGO_URI is not set (check your .env). Aborting.');
  process.exit(1);
}

async function existingNames(collection) {
  try {
    const list = await collection.listSearchIndexes().toArray();
    return new Set(list.map((i) => i.name));
  } catch {
    // listSearchIndexes is unsupported off-Atlas — let createSearchIndex surface it.
    return new Set();
  }
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(); // default DB from the connection string
  console.log(`Connected to "${db.databaseName}". Creating vector search indexes…\n`);

  for (const { collection, name, definition } of INDEXES) {
    const col = db.collection(collection);
    const have = await existingNames(col);
    if (have.has(name)) {
      console.log(`• ${collection}.${name} — already exists, skipping`);
      continue;
    }
    try {
      await col.createSearchIndex({ name, type: 'vectorSearch', definition });
      console.log(`✓ ${collection}.${name} — created (building; watch status in Atlas)`);
    } catch (err) {
      console.error(`✗ ${collection}.${name} — failed: ${err?.message || err}`);
      console.error(
        '  Vector Search needs an Atlas cluster whose tier supports it. ' +
          'It is NOT available on a local mongod.',
      );
    }
  }

  await client.close();
  console.log(
    '\nDone. Indexes build asynchronously — wait until they report READY in the Atlas UI, ' +
      'then set RAG_USE_VECTOR_SEARCH=true and restart the API.',
  );
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
