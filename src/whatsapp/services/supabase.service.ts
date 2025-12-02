import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResultRow } from 'pg';

@Injectable()
export class SupabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(SupabaseService.name);
  private pool?: Pool;
  private warnedAboutPool = false;

  constructor(private readonly configService: ConfigService) {
    const resolved = this.resolveConnectionString();

    if (!resolved) {
      this.logger.warn(
        'No se encontró ninguna variable de conexión (SUPABASE_DB_URL, POSTGRES_PRISMA_URL, POSTGRES_URL o POSTGRES_URL_NON_POOLING). Operaciones multi-tenant deshabilitadas.',
      );
      return;
    }

    const poolSize = Number(
      this.configService.get<string>('SUPABASE_DB_POOL_SIZE', '5'),
    );

    this.pool = new Pool({
      connectionString: this.enforceConnectionParams(resolved.value),
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
          'Pool de Supabase no inicializado, consultas serán omitidas hasta configurar alguna variable de conexión (SUPABASE_DB_URL o POSTGRES_*).',
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

  private resolveConnectionString():
    | { value: string; key: string }
    | undefined {
    const candidates = [
      'SUPABASE_DB_URL',
      'POSTGRES_PRISMA_URL',
      'POSTGRES_URL',
      'POSTGRES_URL_NON_POOLING',
    ];

    for (const key of candidates) {
      const value = this.configService.get<string>(key);
      if (value) {
        if (key === 'POSTGRES_URL_NON_POOLING') {
          this.logger.warn(
            'Usando POSTGRES_URL_NON_POOLING (puerto 5432). Considera cambiar a POSTGRES_PRISMA_URL/POSTGRES_URL para aprovechar el pool en 6543.',
          );
        }
        return { value, key };
      }
    }

    return undefined;
  }

  private enforceConnectionParams(url: string): string {
    let finalUrl = url;

    if (!/sslmode=/i.test(finalUrl)) {
      finalUrl = this.appendParam(finalUrl, 'sslmode=require');
    }

    const is5432 = /:(5432)\//.test(finalUrl);
    const hasPgBouncer = /pgbouncer=true/i.test(finalUrl);

    if (!is5432 && !hasPgBouncer) {
      finalUrl = this.appendParam(finalUrl, 'pgbouncer=true');
    } else if (is5432 && !hasPgBouncer) {
      this.logger.warn(
        'Conexión detectada en el puerto 5432 sin pgbouncer. Esto puede agotar conexiones cuando llegan múltiples webhooks.',
      );
    }

    return finalUrl;
  }

  private appendParam(url: string, param: string): string {
    return url.includes('?') ? `${url}&${param}` : `${url}?${param}`;
  }
}
