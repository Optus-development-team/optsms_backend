import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResultRow } from 'pg';

@Injectable()
export class SupabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(SupabaseService.name);
  private pool?: Pool;
  private warnedAboutPool = false;

  constructor(private readonly configService: ConfigService) {
    const connectionString = this.configService.get<string>('SUPABASE_DB_URL');

    if (!connectionString) {
      this.logger.warn(
        'SUPABASE_DB_URL no configurada; las operaciones multi-tenant estarán deshabilitadas.',
      );
      return;
    }

    const poolSize = Number(
      this.configService.get<string>('SUPABASE_DB_POOL_SIZE', '5'),
    );

    this.pool = new Pool({
      connectionString: this.enforceConnectionParams(connectionString),
      max: Number.isFinite(poolSize) ? poolSize : 5,
      idleTimeoutMillis: 10_000,
      ssl: { rejectUnauthorized: false },
    });
  }

  isEnabled(): boolean {
    return Boolean(this.pool);
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    if (!this.pool) {
      if (!this.warnedAboutPool) {
        this.logger.warn(
          'Pool de Supabase no inicializado, consultas serán omitidas hasta configurar SUPABASE_DB_URL.',
        );
        this.warnedAboutPool = true;
      }
      return [];
    }

    try {
      const result = await this.pool.query<T>(sql, params);
      return result.rows;
    } catch (error) {
      const safeError = error as Error;
      this.logger.error(
        `Error ejecutando consulta: ${safeError.message ?? 'desconocido'}`,
      );
      throw safeError;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  private enforceConnectionParams(url: string): string {
    let finalUrl = url;

    if (!finalUrl.includes('pgbouncer=true')) {
      finalUrl = this.appendParam(finalUrl, 'pgbouncer=true');
    }

    if (!/sslmode=/i.test(finalUrl)) {
      finalUrl = this.appendParam(finalUrl, 'sslmode=require');
    }

    return finalUrl;
  }

  private appendParam(url: string, param: string): string {
    return url.includes('?') ? `${url}&${param}` : `${url}?${param}`;
  }
}
