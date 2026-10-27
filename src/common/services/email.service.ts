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

  async sendVerificationCode(email: string, code: string): Promise<boolean> {
    const from =
      this.configService.get<string>('EMAIL_FROM') ?? 'noreply@onlinemart.com';
    const subject = 'Your Verification Code';
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Password Verification</h2>
        <p>Your verification code is:</p>
        <h1 style="letter-spacing: 5px; color: #2563eb;">${code}</h1>
        <p>This code will expire in 15 minutes.</p>
        <p>If you did not request this, please ignore this email.</p>
      </div>
    `;

    if (!this.transporter) {
      this.logger.log(`[DEV MODE] Verification code for ${email}: ${code}`);
      return true;
    }

    try {
      await this.transporter.sendMail({
        from,
        to: email,
        subject,
        html,
        text: `Your verification code is ${code}. It expires in 15 minutes.`,
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${email}`, error);
      return false;
    }
  }
}
