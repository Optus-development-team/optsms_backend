import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PaymentClientService } from './payment-client.service';
import { SupabaseService } from './supabase.service';
import { IdentityService } from './identity.service';
import { WhatsappService } from '../whatsapp.service';
import { CompanyIntegrationsService } from './company-integrations.service';

interface CompanyRow {
  id: string;
}

@Injectable()
export class PaymentWarmupService implements OnModuleInit {
  private readonly logger = new Logger(PaymentWarmupService.name);

  constructor(
    private readonly paymentClient: PaymentClientService,
    private readonly supabase: SupabaseService,
    private readonly identityService: IdentityService,
    private readonly whatsappService: WhatsappService,
    private readonly companyIntegrations: CompanyIntegrationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.executeWarmup('startup');
  }

  @Interval(10 * 60 * 1000)
  async scheduledWarmup(): Promise<void> {
    await this.executeWarmup('interval');
  }

  private async executeWarmup(reason: string): Promise<void> {
    if (!this.supabase.isEnabled()) {
      return;
    }

    const companies = await this.supabase.query<CompanyRow>(
      'SELECT id FROM public.companies',
    );

    for (const company of companies) {
      try {
        const result = await this.paymentClient.warmupBankSession(company.id);

        if (result.requiresTwoFactor) {
          await this.companyIntegrations.markTwoFactorAttention(
            company.id,
            true,
          );
          await this.notifyAdmins(company.id);
        }
      } catch (error) {
        const safeError = error as Error;
        this.logger.warn(
          `Warmup falló para ${company.id} (${reason}): ${safeError.message}`,
        );
      }
    }
  }

  private async notifyAdmins(companyId: string): Promise<void> {
    const admins = await this.identityService.getAdminPhones(companyId);
    for (const admin of admins) {
      await this.whatsappService.sendTextMessage(
        admin,
        '⚠️ El banco solicitó un código 2FA para continuar con la automatización de pagos. Responde con el token cuando lo tengas.',
        { companyId },
      );
    }
  }
}
