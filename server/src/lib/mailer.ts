import type { AppConfig } from '../config.ts';
import type { Logger } from './logger.ts';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  readonly delivers: boolean;
  send(message: MailMessage): Promise<void>;
}

/** Development transport: prints messages to the server log instead of sending them. */
export class ConsoleMailer implements Mailer {
  readonly delivers = false;
  private readonly log: Logger;

  constructor(log: Logger) {
    this.log = log;
  }

  async send(message: MailMessage): Promise<void> {
    this.log.info(`[mail] To: ${message.to} | ${message.subject}\n${message.text}`);
  }
}

/** Collects messages in memory — used by the automated tests. */
export class MemoryMailer implements Mailer {
  readonly delivers = false;
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

class SmtpMailer implements Mailer {
  readonly delivers = true;
  private readonly config: AppConfig['mail'];
  private transport: Promise<{ sendMail(options: Record<string, unknown>): Promise<unknown> }> | null = null;

  constructor(config: AppConfig['mail']) {
    this.config = config;
  }

  private getTransport() {
    this.transport ??= import('nodemailer').then(({ default: nodemailer }) =>
      nodemailer.createTransport({
        host: this.config.smtpHost,
        port: this.config.smtpPort,
        secure: this.config.smtpSecure,
        auth: this.config.smtpUser ? { user: this.config.smtpUser, pass: this.config.smtpPass } : undefined,
      }),
    );
    return this.transport;
  }

  async send(message: MailMessage): Promise<void> {
    const transport = await this.getTransport();
    await transport.sendMail({ from: this.config.from, to: message.to, subject: message.subject, text: message.text });
  }
}

export function createMailer(config: AppConfig, log: Logger): Mailer {
  if (config.mail.smtpHost) return new SmtpMailer(config.mail);
  if (config.isProduction) {
    log.warn('SMTP_HOST is not configured: emails (sign-in codes, confirmations) will only be written to the log.');
  }
  return new ConsoleMailer(log);
}
