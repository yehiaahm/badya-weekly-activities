import type { AppConfig } from '../config-base.ts';
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

/**
 * Sends email through the same Google Apps Script web app that fills the Google Sheet
 * (`MailApp.sendEmail`, free; roughly 100 recipients/day for a personal Google account).
 * Plain `fetch`, so it works on Cloudflare Workers where SMTP is not available.
 */
export class AppsScriptMailer implements Mailer {
  readonly delivers = true;
  private readonly config: AppConfig['sheet'];
  private readonly from: string;

  constructor(config: AppConfig['sheet'], from: string) {
    this.config = config;
    this.from = from;
  }

  async send(message: MailMessage): Promise<void> {
    const response = await fetch(this.config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: this.config.secret, action: 'mail', from: this.from, ...message }),
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
    });
    const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!response.ok || !result?.ok) throw new Error(`Mail webhook failed: ${result?.error ?? `HTTP ${response.status}`}`);
  }
}

export function createMailer(config: AppConfig, log: Logger): Mailer {
  if (config.sheet.webhookUrl) return new AppsScriptMailer(config.sheet, config.mail.from);
  if (config.isProduction) {
    log.warn('SHEET_WEBHOOK_URL is not configured: emails (sign-in codes, confirmations) will only be written to the log.');
  }
  return new ConsoleMailer(log);
}
