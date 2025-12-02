import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from './supabase.service';
import type { TenantContext } from '../whatsapp.types';
import { UserRole } from '../whatsapp.types';

interface CompanyRow {
  id: string;
  name: string;
  config: unknown;
}

interface CompanyUserRow {
  role?: string | null;
  phone: string;
}

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);
  private readonly adminPhone: string;
  private readonly fallbackCompanyId?: string;
  private readonly fallbackCompanyName: string;
  private readonly fallbackCompanyConfig: Record<string, unknown>;

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseService: SupabaseService,
  ) {
    this.adminPhone = this.configService.get<string>('ADMIN_PHONE_NUMBER', '');
    this.fallbackCompanyId =
      this.configService.get<string>('DEFAULT_COMPANY_ID');
    this.fallbackCompanyName = this.configService.get<string>(
      'DEFAULT_COMPANY_NAME',
      'Sandbox Company',
    );
    this.fallbackCompanyConfig = this.parseConfig(
      this.configService.get<string>('DEFAULT_COMPANY_CONFIG', '{}'),
    );
  }

  async resolveTenantByPhoneId(
    phoneNumberId?: string,
  ): Promise<TenantContext | null> {
    if (!phoneNumberId) {
      this.logger.warn('phone_number_id no presente en el webhook.');
      return null;
    }

    if (!this.supabaseService.isEnabled()) {
      return this.buildFallbackTenant(phoneNumberId);
    }

    const rows = await this.supabaseService.query<CompanyRow>(
      'SELECT id, name, config FROM public.companies WHERE whatsapp_phone_id = $1 LIMIT 1',
      [phoneNumberId],
    );

    if (!rows.length) {
      this.logger.warn(
        `No se encontró compañía para phone_number_id=${phoneNumberId}.`,
      );
      return null;
    }

    return {
      companyId: rows[0].id,
      companyName: rows[0].name,
      companyConfig: this.parseConfig(rows[0].config),
      phoneNumberId,
    };
  }

  async resolveRole(companyId: string, senderId: string): Promise<UserRole> {
    const sanitizedSender = this.cleanNumber(senderId);

    if (this.supabaseService.isEnabled()) {
      const rows = await this.supabaseService.query<CompanyUserRow>(
        `SELECT role, phone FROM public.company_users
         WHERE company_id = $1
         AND regexp_replace(phone, '\\D', '', 'g') = $2
         LIMIT 1`,
        [companyId, sanitizedSender],
      );

      if (rows.length) {
        const normalizedRole = rows[0].role?.toUpperCase();
        if (normalizedRole === 'ADMIN' || normalizedRole === 'ROLE_ADMIN') {
          return UserRole.ADMIN;
        }
        return UserRole.CLIENT;
      }
    }

    if (
      this.adminPhone &&
      this.cleanNumber(this.adminPhone) === sanitizedSender
    ) {
      return UserRole.ADMIN;
    }

    return UserRole.CLIENT;
  }

  async getAdminPhones(companyId: string): Promise<string[]> {
    if (!this.supabaseService.isEnabled()) {
      return this.adminPhone ? [this.cleanNumber(this.adminPhone)] : [];
    }

    const rows = await this.supabaseService.query<CompanyUserRow>(
      `SELECT phone FROM public.company_users
       WHERE company_id = $1 AND role = 'ADMIN'`,
      [companyId],
    );

    if (!rows.length && this.adminPhone) {
      return [this.cleanNumber(this.adminPhone)];
    }

    return rows
      .map((row) => this.cleanNumber(row.phone))
      .filter((phone) => Boolean(phone));
  }

  async ensureCompanyUser(
    companyId: string,
    rawPhone: string,
    role: UserRole,
  ): Promise<string | null> {
    if (!this.supabaseService.isEnabled()) {
      return null;
    }

    const phone = this.cleanNumber(rawPhone);
    const existing = await this.supabaseService.query<{ id: string }>(
      `SELECT id FROM public.company_users
       WHERE company_id = $1
       AND regexp_replace(phone, '\\D', '', 'g') = $2
       LIMIT 1`,
      [companyId, phone],
    );

    if (existing[0]?.id) {
      return existing[0].id;
    }

    const dbRole = role === UserRole.ADMIN ? 'ADMIN' : 'CLIENT';
    const rows = await this.supabaseService.query<{ id: string }>(
      `INSERT INTO public.company_users (company_id, phone, role)
       VALUES ($1, $2, $3::user_role)
       ON CONFLICT (company_id, phone) DO UPDATE SET role = EXCLUDED.role
       RETURNING id`,
      [companyId, phone, dbRole],
    );

    return rows[0]?.id ?? null;
  }

  private cleanNumber(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  private parseConfig(value: unknown): Record<string, unknown> {
    if (!value) {
      return {};
    }

    if (typeof value === 'object') {
      return value as Record<string, unknown>;
    }

    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as Record<string, unknown>;
      } catch {
        return {};
      }
    }

    return {};
  }

  private buildFallbackTenant(phoneNumberId: string): TenantContext | null {
    if (!this.fallbackCompanyId) {
      this.logger.error(
        'No hay conexión a Supabase ni DEFAULT_COMPANY_ID configurado. Ignorando mensaje.',
      );
      return null;
    }

    return {
      companyId: this.fallbackCompanyId,
      companyName: this.fallbackCompanyName,
      companyConfig: this.fallbackCompanyConfig,
      phoneNumberId,
    };
  }
}
