import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { renderNotificationEmail } from './templates/notification-email';
import {
  EmailCta,
  renderEmailLayout,
  escapeHtml,
} from './templates/email-layout';

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  /** Brevo API key (BREVO_API_KEY). */
  private readonly apiKey?: string;
  /** Raw MAIL_FROM, e.g. "EduGenie <you@gmail.com>" — must be a verified Brevo sender. */
  private readonly from: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apiKey = this.configService.get<string>('BREVO_API_KEY');
    this.from =
      this.configService.get<string>('MAIL_FROM') ||
      'EduGenie <noreply@edugenie.app>';
  }

  /** Whether a real transactional-email provider is configured. */
  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  /** Splits "Name <email>" into its parts (falls back to a bare address). */
  private parseFrom(): { name: string; email: string } {
    const match = /^\s*(.*?)\s*<\s*([^>]+?)\s*>\s*$/.exec(this.from);
    if (match) return { name: match[1] || 'EduGenie', email: match[2] };
    return { name: 'EduGenie', email: this.from.trim() };
  }

  /**
   * Sends an email via Brevo's REST API. When BREVO_API_KEY is not configured
   * (e.g. local dev) it logs the message instead of throwing, so flows that
   * depend on email still complete and the link can be copied from the logs.
   */
  async send(options: SendMailOptions): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn(
        `BREVO_API_KEY not set — email to ${options.to} not sent. Subject: "${options.subject}"`,
      );
      return;
    }

    try {
      const sender = this.parseFrom();
      await firstValueFrom(
        this.httpService.post(
          'https://api.brevo.com/v3/smtp/email',
          {
            sender: { email: sender.email, name: sender.name },
            to: [{ email: options.to }],
            subject: options.subject,
            htmlContent: options.html,
          },
          {
            headers: {
              'api-key': this.apiKey,
              'Content-Type': 'application/json',
              accept: 'application/json',
            },
          },
        ),
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to send email to ${options.to}: ${error?.response?.data?.message || error?.message}`,
      );
      throw error;
    }
  }

  /**
   * Sends a generic event email built from the same title/message an in-app
   * notification carries, wrapped in the branded layout with an optional CTA.
   * Used by the central notification → email dispatch (Phase 3).
   */
  async sendNotificationEmail(params: {
    to: string;
    firstName?: string;
    subject: string;
    heading: string;
    message: string;
    cta?: EmailCta;
  }): Promise<void> {
    const html = renderNotificationEmail({
      firstName: params.firstName,
      heading: params.heading,
      message: params.message,
      cta: params.cta,
    });
    await this.send({ to: params.to, subject: params.subject, html });
  }

  /** Welcome + email-verification link sent on registration. */
  async sendWelcomeVerifyEmail(params: {
    to: string;
    firstName: string;
    verifyUrl: string;
    expiresInHours: number;
  }): Promise<void> {
    const { to, firstName, verifyUrl, expiresInHours } = params;
    const bodyHtml = `
      <p style="margin:0 0 12px;font-size:14px;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151;">
        Welcome to EduGenie! Please confirm your email address to activate your
        account. This link expires in ${expiresInHours} hours.
      </p>`;
    const html = renderEmailLayout({
      heading: 'Confirm your email',
      bodyHtml,
      cta: { label: 'Verify my email', url: verifyUrl },
      footerNote:
        "If you didn't create an EduGenie account, you can safely ignore this email.",
    });
    await this.send({ to, subject: 'Confirm your EduGenie email', html });
  }

  /** Password-reset link sent from the forgot-password flow. */
  async sendPasswordResetEmail(params: {
    to: string;
    firstName: string;
    resetUrl: string;
    expiresInMinutes: number;
  }): Promise<void> {
    const { to, firstName, resetUrl, expiresInMinutes } = params;
    const bodyHtml = `
      <p style="margin:0 0 12px;font-size:14px;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151;">
        We received a request to reset your EduGenie password. Click below to
        choose a new one. This link expires in ${expiresInMinutes} minutes.
      </p>`;
    const html = renderEmailLayout({
      heading: 'Reset your password',
      bodyHtml,
      cta: { label: 'Reset password', url: resetUrl },
      footerNote:
        "If you didn't request a password reset, you can safely ignore this email — your password won't change.",
    });
    await this.send({ to, subject: 'Reset your EduGenie password', html });
  }

  /** Confirmation sent after a password is successfully changed. */
  async sendPasswordChangedEmail(params: {
    to: string;
    firstName: string;
  }): Promise<void> {
    const { to, firstName } = params;
    const bodyHtml = `
      <p style="margin:0 0 12px;font-size:14px;">Hi ${escapeHtml(firstName)},</p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151;">
        Your EduGenie password was just changed. If this was you, no action is
        needed. If you did not change your password, please reset it immediately
        and contact support.
      </p>`;
    const html = renderEmailLayout({
      heading: 'Your password was changed',
      bodyHtml,
      footerNote: 'This is a security notification for your EduGenie account.',
    });
    await this.send({
      to,
      subject: 'Your EduGenie password was changed',
      html,
    });
  }

  async sendAdminInvite(params: {
    to: string;
    firstName: string;
    inviteUrl: string;
    expiresInHours: number;
  }): Promise<void> {
    const { to, firstName, inviteUrl, expiresInHours } = params;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1f2937;">
        <h2 style="color: #2e2a91;">You've been invited to EduGenie</h2>
        <p>Hi ${firstName},</p>
        <p>A superadmin has invited you to join the EduGenie team as an <strong>administrator</strong>.</p>
        <p>Click the button below to set your password and activate your account. This link expires in ${expiresInHours} hours.</p>
        <p style="margin: 28px 0;">
          <a href="${inviteUrl}"
             style="background: #2e2a91; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
            Accept invitation
          </a>
        </p>
        <p style="font-size: 13px; color: #6b7280;">If the button doesn't work, copy and paste this URL into your browser:</p>
        <p style="font-size: 13px; word-break: break-all;"><a href="${inviteUrl}">${inviteUrl}</a></p>
        <p style="font-size: 13px; color: #6b7280;">If you weren't expecting this invitation, you can safely ignore this email.</p>
      </div>
    `;

    await this.send({
      to,
      subject: 'Your EduGenie admin invitation',
      html,
    });
  }
}
