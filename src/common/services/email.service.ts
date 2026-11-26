import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

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
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<number>('SMTP_PORT')) || 587;
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        host: host || 'smtp.gmail.com',
        port,
        secure: port === 465,
        auth: {
          user,
          pass,
        },
      });
    }
  }

  /** Sends an email via configured SMTP or logs in dev mode when SMTP is unconfigured. */
  async sendMail(options: SendEmailOptions): Promise<boolean> {
    const from =
      this.configService.get<string>('EMAIL_FROM') ?? 'noreply@onlinemart.com';

    if (!this.transporter) {
      this.logger.log(
        `[DEV MODE] Email to ${options.to} | Subject: ${options.subject}${options.text ? ` | ${options.text}` : ''}`,
      );
      return true;
    }

    try {
      await this.transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}`, error);
      return false;
    }
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
