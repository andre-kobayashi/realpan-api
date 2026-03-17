// ═══════════════════════════════════════════════════════════
// Real Pan - Email Service (Resend)
// ═══════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';

const prisma = new PrismaClient();

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface CompanyEmailConfig {
  fromName: string;
  fromEmail: string;
  replyTo: string;
  resendApiKey: string | null;
  logoUrl: string | null;
  companyName: string;
  companyNameJa: string | null;
  phone: string;
  website: string | null;
}

class EmailService {
  private resend: Resend | null = null;
  private config: CompanyEmailConfig | null = null;
  private configLoadedAt: number = 0;
  private CONFIG_TTL = 5 * 60 * 1000;

  async getConfig(companyKey: string = 'realpan'): Promise<CompanyEmailConfig> {
    const now = Date.now();
    if (this.config && (now - this.configLoadedAt) < this.CONFIG_TTL) {
      return this.config;
    }

    const settings = await prisma.companySettings.findUnique({
      where: { companyKey }
    });

    if (!settings) {
      throw new Error(`CompanySettings not found for key: ${companyKey}`);
    }

    const resendApiKey = process.env.RESEND_API_KEY || settings.smtpPassword || null;

    this.config = {
      fromName: settings.smtpFromName || settings.companyName || 'Real Pan',
      fromEmail: settings.smtpFromEmail || 'noreply@realpan.jp',
      replyTo: 'clientrealpan@gmail.com',
      resendApiKey,
      logoUrl: settings.logoUrl || null,
      companyName: settings.companyName,
      companyNameJa: settings.companyNameJa || null,
      phone: settings.phone,
      website: settings.website || 'https://realpan.jp',
    };

    if (resendApiKey) {
      this.resend = new Resend(resendApiKey);
    }

    this.configLoadedAt = now;
    return this.config;
  }

  async send(options: EmailOptions, companyKey: string = 'realpan'): Promise<EmailResult> {
    try {
      const config = await this.getConfig(companyKey);

      if (!this.resend || !config.resendApiKey) {
        throw new Error('Resend API key not configured. Set RESEND_API_KEY env var or smtpPassword in CompanySettings.');
      }

      const { data, error } = await this.resend.emails.send({
        from: `${config.fromName} <${config.fromEmail}>`,
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
        replyTo: options.replyTo || config.replyTo,
        tags: options.tags,
      });

      if (error) {
        console.error('❌ Resend error:', error);
        return { success: false, error: error.message };
      }

      console.log(`✅ Email sent: ${options.subject} → ${options.to} [${data?.id}]`);
      return { success: true, messageId: data?.id };

    } catch (err: any) {
      console.error('❌ Email send failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  async sendTest(to: string, companyKey: string = 'realpan'): Promise<EmailResult> {
    const config = await this.getConfig(companyKey);
    return this.send({
      to,
      subject: '✅ Real Pan - テストメール / Email de Teste',
      html: `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            ${config.logoUrl
              ? `<img src="https://api.realpan.jp${config.logoUrl}" alt="Real Pan" style="height: 60px;" />`
              : `<h1 style="color: #1e3a5f; font-size: 28px; margin: 0;">🍞 Real Pan</h1>`
            }
          </div>
          <div style="background: #f8f9fa; border-radius: 12px; padding: 30px; text-align: center;">
            <h2 style="color: #1e3a5f; margin: 0 0 10px;">テストメール成功！</h2>
            <p style="color: #666; margin: 0 0 20px;">Email de teste enviado com sucesso!</p>
            <div style="background: #e8f5e9; border-radius: 8px; padding: 15px; display: inline-block;">
              <span style="color: #2e7d32; font-size: 18px;">✅ Configuração OK</span>
            </div>
            <p style="color: #999; font-size: 13px; margin-top: 20px;">
              Enviado via Resend - ${new Date().toISOString()}
            </p>
          </div>
          <p style="color: #999; font-size: 12px; text-align: center; margin-top: 20px;">
            ${config.companyName} ${config.companyNameJa ? `/ ${config.companyNameJa}` : ''}
          </p>
        </div>
      `,
    }, companyKey);
  }
}

export const emailService = new EmailService();
export default emailService;
