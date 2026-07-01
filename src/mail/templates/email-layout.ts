// src/mail/templates/email-layout.ts
// Shared, branded HTML shell for every transactional email. Keep templates
// (welcome, verification, notifications, digests…) building on this so the look
// stays consistent and we escape user-supplied content in one place.

export interface EmailCta {
  label: string;
  url: string;
}

const BRAND = '#2e2a91';

/** Escapes text that will be interpolated into email HTML. */
export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Wraps body HTML in the EduGenie shell (header + card + footer). `bodyHtml` is
 * assumed already safe/escaped by the caller; `heading` and the optional CTA
 * label are escaped here.
 */
export function renderEmailLayout(opts: {
  heading: string;
  bodyHtml: string;
  cta?: EmailCta;
  footerNote?: string;
}): string {
  const { heading, bodyHtml, cta, footerNote } = opts;

  const ctaHtml = cta
    ? `<p style="margin:28px 0 4px;">
         <a href="${cta.url}"
            style="background:${BRAND};color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold;font-size:14px;">
           ${escapeHtml(cta.label)}
         </a>
       </p>`
    : '';

  const footer =
    footerNote ??
    'You are receiving this email because of activity on your EduGenie account.';

  return `
  <div style="background:#f3f4f6;padding:24px 0;">
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:${BRAND};padding:20px 32px;">
        <span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:-0.3px;">EduGenie</span>
      </div>
      <div style="padding:28px 32px;color:#1f2937;">
        <h2 style="margin:0 0 12px;color:#111827;font-size:19px;">${escapeHtml(heading)}</h2>
        ${bodyHtml}
        ${ctaHtml}
      </div>
      <div style="padding:18px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;">
        ${footer}
      </div>
    </div>
  </div>`;
}
