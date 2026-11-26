import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendNotificationEmailOptions {
  to: string;
  recipientName?: string | null;
  title: string;
  message: string;
}

const BREVO_EMAIL_API_URL = 'https://api.brevo.com/v3/smtp/email';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  /** Sends a transactional email via the Brevo HTTP API. */
  async sendMail(options: SendEmailOptions): Promise<boolean> {
    const apiKey =
      this.configService.get<string>('BREVO_API_KEY')?.trim() ||
      process.env.BREVO_API_KEY?.trim();
    const fromEmail =
      this.configService.get<string>('EMAIL_FROM')?.trim() ||
      process.env.EMAIL_FROM?.trim();

    if (!apiKey) {
      const message = 'BREVO_API_KEY is not configured in environment';
      this.logger.error(message);
      throw new Error(message);
    }

    if (!fromEmail) {
      const message = 'EMAIL_FROM is not configured in environment';
      this.logger.error(message);
      throw new Error(message);
    }

    const response = await fetch(BREVO_EMAIL_API_URL, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          email: fromEmail,
          name: 'The Daily Tokri',
        },
        to: [{ email: options.to }],
        subject: options.subject,
        htmlContent: options.html,
      }),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      this.logger.error(
        `Failed to send email to ${options.to} via Brevo (status ${response.status}): ${responseBody}`,
      );
      throw new Error(
        `Brevo email API failed with status ${response.status}: ${responseBody}`,
      );
    }

    return true;
  }

  async sendVerificationCode(
    email: string,
    code: string,
    purpose: string = 'Verification',
  ): Promise<boolean> {
    const safePurpose = escapeHtml(purpose);
    const safeCode = escapeHtml(code);
    const subject = `${purpose} Code - The Daily Tokri`;
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #1e293b;">${safePurpose}</h2>
        <p>Your verification code is:</p>
        <h1 style="letter-spacing: 5px; color: #2563eb; font-size: 32px;">${safeCode}</h1>
        <p>This code will expire in 15 minutes.</p>
        <p>If you did not request this, please ignore this email.</p>
      </div>
    `;

    return this.sendMail({
      to: email,
      subject,
      html,
      text: `Your verification code is ${code}. It expires in 15 minutes.`,
    });
  }

  /** Sends a formatted transactional or store alert notification email. */
  async sendNotificationEmail(
    options: SendNotificationEmailOptions,
  ): Promise<boolean> {
    const greeting = options.recipientName?.trim()
      ? `Hi ${escapeHtml(options.recipientName.trim())},`
      : 'Hello,';
    const safeTitle = escapeHtml(options.title);
    const safeMessage = escapeHtml(options.message);

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 8px;">
        <p style="margin: 0 0 8px; font-size: 12px; font-weight: bold; letter-spacing: 0.5px; text-transform: uppercase; color: #15803d;">
          The-Daily-Tokri
        </p>
        <h2 style="margin: 0 0 16px; font-size: 20px; color: #0f172a;">${safeTitle}</h2>
        <p style="margin: 0 0 12px; font-size: 14px; line-height: 1.5;">${greeting}</p>
        <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #334155;">${safeMessage}</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="margin: 0; font-size: 12px; color: #64748b;">
          You can update your email notification preferences anytime in your account settings.
        </p>
      </div>
    `;

    return this.sendMail({
      to: options.to,
      subject: `${options.title} - The Daily Tokri`,
      html,
      text: `${options.title}\n\n${options.message}`,
    });
  }
}
