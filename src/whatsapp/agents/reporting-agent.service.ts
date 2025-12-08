import { Injectable, Logger } from '@nestjs/common';
import type {
  AgentResponse,
  RouterMessageContext,
  SanitizedTextResult,
} from '../whatsapp.types';
import { SupabaseService } from '../services/supabase.service';
import { GeminiService } from '../services/gemini.service';

@Injectable()
export class ReportingAgentService {
  private readonly logger = new Logger(ReportingAgentService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly geminiService: GeminiService,
  ) {}

  async handle(
    context: RouterMessageContext,
    sanitized: SanitizedTextResult,
  ): Promise<AgentResponse> {
    if (this.geminiService.isEnabled()) {
      return this.handleWithGemini(context, sanitized);
    }

    return this.handleWithFallback(context, sanitized);
  }

  private async handleWithGemini(
    context: RouterMessageContext,
    sanitized: SanitizedTextResult,
  ): Promise<AgentResponse> {
    try {
      const model = this.geminiService.getModel();
      if (!model) {
        return this.handleWithFallback(context, sanitized);
      }

      // Obtener datos reales de Supabase
      const metrics = await this.fetchRealMetrics(context.tenant.companyId);

      const config = context.tenant.companyConfig;
      const profile = config?.profile || {};
      const businessInfo = config?.business_info || {};

      const agentName = profile.agent_name || 'asistente';
      const industry = businessInfo.industry || 'general';

      const instruction = `Eres ${agentName}, analista de datos de la empresa.

Industria: ${industry}
Empresa: ${context.tenant.companyName}

Datos actuales:
- Órdenes completadas hoy: ${metrics.ordersToday}
- Órdenes pendientes: ${metrics.ordersPending}
- Citas agendadas hoy: ${metrics.appointmentsToday}
- Citas próximas: ${metrics.appointmentsUpcoming}
- Total de usuarios: ${metrics.totalUsers}

El administrador pidió: "${sanitized.normalizedText}"

Genera un reporte ejecutivo claro y profesional en español:
1. Resume las métricas clave en formato de lista
2. Identifica tendencias o alertas si las hay
3. Mantén el tono profesional pero accesible
4. Máximo 5-6 líneas
5. Usa emojis relevantes para mejor legibilidad`;

      const result = await this.geminiService.generateText(instruction);

      const reportText =
        result || 'Reporte generado. Revisa las métricas actuales.';

      return {
        actions: [
          {
            type: 'text',
            text: reportText,
          },
        ],
        metadata: {
          gemini_powered: true,
          requester: context.senderId,
          sanitizedPreview: sanitized.sanitizedText.slice(0, 160),
          metrics,
        },
      };
    } catch (error) {
      this.logger.error('Error en reporting agent con Gemini:', error);
      return this.handleWithFallback(context, sanitized);
    }
  }

  private handleWithFallback(
    context: RouterMessageContext,
    sanitized: SanitizedTextResult,
  ): AgentResponse {
    const snapshots = this.buildInstantMetrics();

    return {
      actions: [
        {
          type: 'text',
          text: 'Reporte ejecutivo listo 📊\nConsolidando ventas, inventario y agenda directamente desde la base transaccional.',
        },
        {
          type: 'text',
          text: `Últimas métricas:\n• Ventas del día: ${snapshots.salesToday}\n• Inventario crítico: ${snapshots.lowStock}\n• Citas activas: ${snapshots.activeAppointments}\nSi necesitas otro desglose indícame el rango o el SKU específico.`,
        },
      ],
      metadata: {
        requester: context.senderId,
        sanitizedPreview: sanitized.sanitizedText.slice(0, 160),
      },
    };
  }

  private async fetchRealMetrics(companyId: string): Promise<{
    ordersToday: number;
    ordersPending: number;
    appointmentsToday: number;
    appointmentsUpcoming: number;
    totalUsers: number;
  }> {
    if (!this.supabase.isEnabled()) {
      return {
        ordersToday: 0,
        ordersPending: 0,
        appointmentsToday: 0,
        appointmentsUpcoming: 0,
        totalUsers: 0,
      };
    }

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowISO = tomorrow.toISOString();

      // Órdenes de hoy
      const ordersToday = await this.supabase.query<{ count: number }>(
        `SELECT COUNT(*) as count FROM public.orders 
         WHERE company_id = $1 AND created_at >= $2 AND created_at < $3 AND status = 'completed'`,
        [companyId, todayISO, tomorrowISO],
      );

      // Órdenes pendientes
      const ordersPending = await this.supabase.query<{ count: number }>(
        `SELECT COUNT(*) as count FROM public.orders 
         WHERE company_id = $1 AND status IN ('pending', 'processing')`,
        [companyId],
      );

      // Citas de hoy
      const appointmentsToday = await this.supabase.query<{ count: number }>(
        `SELECT COUNT(*) as count FROM public.appointments 
         WHERE company_id = $1 AND start_time >= $2 AND start_time < $3`,
        [companyId, todayISO, tomorrowISO],
      );

      // Citas próximas (próximos 7 días)
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const appointmentsUpcoming = await this.supabase.query<{ count: number }>(
        `SELECT COUNT(*) as count FROM public.appointments 
         WHERE company_id = $1 AND start_time >= $2 AND start_time < $3`,
        [companyId, tomorrowISO, nextWeek.toISOString()],
      );

      // Total usuarios
      const totalUsers = await this.supabase.query<{ count: number }>(
        `SELECT COUNT(*) as count FROM public.company_users WHERE company_id = $1`,
        [companyId],
      );

      return {
        ordersToday: Number(ordersToday[0]?.count || 0),
        ordersPending: Number(ordersPending[0]?.count || 0),
        appointmentsToday: Number(appointmentsToday[0]?.count || 0),
        appointmentsUpcoming: Number(appointmentsUpcoming[0]?.count || 0),
        totalUsers: Number(totalUsers[0]?.count || 0),
      };
    } catch (error) {
      this.logger.error('Error fetching real metrics:', error);
      return {
        ordersToday: 0,
        ordersPending: 0,
        appointmentsToday: 0,
        appointmentsUpcoming: 0,
        totalUsers: 0,
      };
    }
  }

  private buildInstantMetrics() {
    return {
      salesToday: '$0 (modo demo)',
      lowStock: 'Sincronización pendiente',
      activeAppointments: 0,
    };
  }
}
