import { Global, Injectable, Logger, Module } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { getEnv } from '../config/env';

export interface OutboundMail {
  to: string;
  subject: string;
  text: string;
}

/**
 * SMTP when configured. Without SMTP: development/test keep mails in memory (`outbox`) so
 * flows can be exercised locally; production never logs mail bodies (they contain tokens).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private transporter?: Transporter;
  readonly outbox: OutboundMail[] = [];

  private transport() {
    const env = getEnv();
    if (!env.SMTP_HOST) return undefined;
    this.transporter ??= nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
    return this.transporter;
  }

  async send(mail: OutboundMail) {
    const env = getEnv();
    const transport = this.transport();
    if (transport) {
      try {
        await transport.sendMail({ from: env.MAIL_FROM, ...mail });
      } catch {
        this.logger.error('SMTP delivery failed'); // never log recipient/body
      }
      return;
    }
    if (env.NODE_ENV !== 'production') {
      this.outbox.push(mail);
      if (this.outbox.length > 100) this.outbox.shift();
      if (env.NODE_ENV === 'development') this.logger.warn(`[dev mail, no SMTP configured] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    } else {
      this.logger.error('SMTP is not configured; email was not sent');
    }
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
