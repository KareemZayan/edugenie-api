// Send ONE test email through Brevo to confirm your setup works.
//
//   node scripts/test-email.mjs <recipient@example.com>
//
// Reads BREVO_API_KEY and MAIL_FROM from your .env (loaded via dotenv). The
// MAIL_FROM address MUST be a verified sender in Brevo, or Brevo rejects it.
// This talks to Brevo directly — the API server does NOT need to be running.
import 'dotenv/config';

const recipient = process.argv[2];
const apiKey = process.env.BREVO_API_KEY;
const from = process.env.MAIL_FROM || 'EduGenie <noreply@edugenie.app>';

if (!recipient) {
  console.error('Usage: node scripts/test-email.mjs <recipient@example.com>');
  process.exit(1);
}
if (!apiKey) {
  console.error('❌ BREVO_API_KEY is not set in your environment / .env');
  process.exit(1);
}

// Parse "Name <email>" → { name, email } (Brevo needs them split).
function parseFrom(raw) {
  const m = /^\s*(.*?)\s*<\s*([^>]+?)\s*>\s*$/.exec(raw);
  if (m) return { name: m[1] || 'EduGenie', email: m[2] };
  return { name: 'EduGenie', email: raw.trim() };
}

async function main() {
  const sender = parseFrom(from);
  console.log(`→ Sending test email as ${sender.name} <${sender.email}> to ${recipient} …`);

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender,
      to: [{ email: recipient }],
      subject: 'EduGenie · Brevo test email',
      htmlContent:
        '<div style="font-family:Arial,sans-serif;padding:24px;">' +
        '<h2 style="color:#2e2a91;">It works! 🎉</h2>' +
        '<p>This is a test email sent through Brevo from your EduGenie backend.</p>' +
        '<p style="color:#6b7280;font-size:13px;">If you received this, your BREVO_API_KEY and verified sender are set up correctly.</p>' +
        '</div>',
    }),
  });

  const body = await res.json().catch(() => ({}));

  if (res.ok) {
    console.log(`✅ Sent. Brevo messageId: ${body.messageId ?? '(none returned)'}`);
    console.log('   Check the inbox (and spam folder) for the recipient.');
  } else {
    console.error(`❌ Brevo rejected the request (HTTP ${res.status}):`);
    console.error('  ', JSON.stringify(body));
    if (res.status === 401) {
      console.error('   → 401 usually means a bad/expired BREVO_API_KEY.');
    }
    if (res.status === 400 && String(body.message || '').toLowerCase().includes('sender')) {
      console.error('   → The MAIL_FROM address must be a VERIFIED sender in Brevo (Senders → Add a sender).');
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('❌ Request failed:', err?.message ?? err);
  process.exit(1);
});
