// Log in as an instructor/admin and index a course's transcripts for RAG.
//
//   node scripts/rag-reindex.mjs <courseId> <email> <password> [apiBase]
//   node scripts/rag-reindex.mjs catalog   <email> <password> [apiBase]
//
// Use the literal word "catalog" to index all published courses as roadmap
// recommendation cards. apiBase defaults to http://localhost:3000/api. The API
// must be running and connected to your DB. Find a courseId by opening any
// course in the app — it's the id in the URL (…/courses/<courseId>).

const [, , courseId, email, password, apiBaseArg] = process.argv;
const API = (apiBaseArg || process.env.API_BASE || 'http://localhost:3000/api').replace(/\/$/, '');

if (!courseId || !email || !password) {
  console.error('Usage: node scripts/rag-reindex.mjs <courseId> <email> <password> [apiBase]');
  process.exit(1);
}

async function main() {
  // 1) Log in — staff accounts get the real JWT back in data.exchangeToken.
  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const loginJson = await loginRes.json().catch(() => ({}));
  if (!loginRes.ok) {
    console.error(`✗ Login failed (${loginRes.status}):`, JSON.stringify(loginJson));
    process.exit(1);
  }
  const token = loginJson?.data?.exchangeToken;
  const role = loginJson?.data?.user?.role;
  if (!token) {
    console.error('✗ No token in login response. Full response:', JSON.stringify(loginJson));
    process.exit(1);
  }
  console.log(`✓ Logged in as ${email} (role: ${role || 'unknown'})`);
  if (role && !['instructor', 'admin', 'superadmin'].includes(role)) {
    console.error(`✗ Role "${role}" cannot reindex. Use an instructor/admin/superadmin account.`);
    process.exit(1);
  }

  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Catalog mode: index all published courses for roadmap recommendations.
  if (courseId === 'catalog') {
    console.log('→ Reindexing the course catalog (published courses) …');
    const r = await fetch(`${API}/rag/reindex-catalog`, { method: 'POST', headers: auth });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error(`✗ Catalog reindex failed (${r.status}):`, JSON.stringify(j));
      process.exit(1);
    }
    console.log('✓ Catalog stats:', JSON.stringify(j, null, 2));
    const ready = (j.coursesIndexed ?? 0) + (j.coursesSkipped ?? 0);
    console.log(
      ready > 0
        ? `\n🎉 Catalog ready — the roadmap advisor can recommend ${ready} real course(s).`
        : '\nℹ No published courses found to index.',
    );
    return;
  }

  // 2) Reindex the course.
  console.log(`→ Reindexing course ${courseId} …`);
  const reRes = await fetch(`${API}/rag/reindex/${courseId}`, { method: 'POST', headers: auth });
  const reJson = await reRes.json().catch(() => ({}));
  if (!reRes.ok) {
    console.error(`✗ Reindex failed (${reRes.status}):`, JSON.stringify(reJson));
    process.exit(1);
  }
  console.log('✓ Reindex stats:', JSON.stringify(reJson, null, 2));

  // 3) Confirm chunks landed.
  const stRes = await fetch(`${API}/rag/status/${courseId}`, { headers: auth });
  const stJson = await stRes.json().catch(() => ({}));
  console.log('✓ Status:', JSON.stringify(stJson));

  // 4) Friendly interpretation.
  if ((reJson.lessonsWithTranscript ?? 0) === 0) {
    console.log('\nℹ This course has no transcribed lessons yet, so nothing was indexed.');
    console.log('  Try a course whose videos have generated transcripts, then re-run.');
  } else if ((stJson.chunks ?? 0) > 0) {
    console.log(`\n🎉 Success — ${stJson.chunks} chunks indexed with ${stJson.model}.`);
  }
}

main().catch((e) => {
  console.error('✗ Error:', e?.message || e);
  console.error('  Is the API running and reachable at', API, '?');
  process.exit(1);
});
