// src/mail/templates/notification-email.ts
// Generic event → email body. Phase 3 reuses the same title/message that the
// in-app notification already carries, wrapped in the branded layout with an
// optional call-to-action button.

import { renderEmailLayout, escapeHtml, EmailCta } from './email-layout';

export function renderNotificationEmail(opts: {
  firstName?: string;
  heading: string;
  message: string;
  cta?: EmailCta;
}): string {
  const { firstName, heading, message, cta } = opts;
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : 'Hi,';

  const bodyHtml = `
    <p style="margin:0 0 12px;font-size:14px;">${greeting}</p>
    <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#374151;">${escapeHtml(
      message,
    )}</p>`;

  return renderEmailLayout({ heading, bodyHtml, cta });
}
