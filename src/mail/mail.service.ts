import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey?: string;
  private readonly from: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.from =
      this.configService.get<string>('MAIL_FROM') ||
      'EduGenie <noreply@edugenie.app>';
  }

  /** Whether a real transactional-email provider is configured. */
  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Sends an email via Resend's REST API. When no API key is configured
   * (e.g. local dev) it logs the message instead of throwing, so flows that
   * depend on email still complete and the link can be copied from the logs.
   */
  async send(options: SendMailOptions): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn(
        `RESEND_API_KEY not set — email to ${options.to} not sent. Subject: "${options.subject}"`,
      );
      return;
    }

    try {
      await firstValueFrom(
        this.httpService.post(
          'https://api.resend.com/emails',
          {
            from: this.from,
            to: options.to,
            subject: options.subject,
            html: options.html,
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
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
