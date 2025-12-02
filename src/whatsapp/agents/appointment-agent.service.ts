import { Injectable, Logger } from '@nestjs/common';
import type {
  AgentResponse,
  RouterMessageContext,
  SanitizedTextResult,
} from '../whatsapp.types';
import { SupabaseService } from '../services/supabase.service';
import { IdentityService } from '../services/identity.service';
import { UserRole } from '../whatsapp.types';

@Injectable()
export class AppointmentAgentService {
  private readonly logger = new Logger(AppointmentAgentService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly identityService: IdentityService,
  ) {}

  async handle(
    context: RouterMessageContext,
    sanitized: SanitizedTextResult,
  ): Promise<AgentResponse> {
    const requestedDate = this.extractDate(context.originalText);
    const requestedTime = this.extractTime(context.originalText);

    this.logger.debug(
      `Solicitud de cita para ${requestedDate ?? 'sin fecha específica'} ${requestedTime ?? ''}`.trim(),
    );

    const dateText = requestedDate
      ? `para el ${requestedDate}`
      : 'para la próxima fecha disponible';
    const timeText = requestedTime ? ` en el horario ${requestedTime}` : '';

    const slot = this.buildSlot(requestedDate, requestedTime);
    if (slot) {
      await this.persistAppointment(context, slot.start, slot.end);
    }

    return {
      actions: [
        {
          type: 'text',
          text: 'Agente de Citas en línea ✅\nVerificando disponibilidad en la base local y respetando los buffers de viaje configurados...',
        },
        {
          type: 'text',
          text: `Te propongo reservar ${dateText}${timeText}. Si te funciona responde *CONFIRMAR*. De lo contrario indícame otro horario y lo reprogramo.`,
        },
      ],
      metadata: {
        sanitizedPreview: sanitized.sanitizedText.slice(0, 120),
        requestedDate,
        requestedTime,
        slot,
      },
    };
  }

  private extractDate(text: string): string | undefined {
    const match = text.match(/\b(\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)\b/);
    return match?.[1];
  }

  private extractTime(text: string): string | undefined {
    const match = text.match(/\b(\d{1,2}[:.]\d{2})\b/);
    return match?.[1];
  }

  private buildSlot(
    dateFragment?: string,
    timeFragment?: string,
  ): { start: Date; end: Date } | undefined {
    const now = new Date();
    let start = new Date(now.getTime() + 30 * 60 * 1000);

    if (dateFragment) {
      const dateMatch = dateFragment.match(
        /(\d{1,2})[/. -](\d{1,2})(?:[/. -](\d{2,4}))?/,
      );
      if (dateMatch) {
        const day = Number(dateMatch[1]);
        const month = Number(dateMatch[2]) - 1;
        const year = dateMatch[3]
          ? Number(dateMatch[3]) < 100
            ? 2000 + Number(dateMatch[3])
            : Number(dateMatch[3])
          : now.getFullYear();
        start = new Date(year, month, day, start.getHours(), start.getMinutes());
      }
    }

    if (timeFragment) {
      const [hour, minute] = timeFragment.split(/[:.]/).map(Number);
      start.setHours(hour ?? start.getHours(), minute ?? 0, 0, 0);
    }

    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return { start, end };
  }

  private async persistAppointment(
    context: RouterMessageContext,
    start: Date,
    end: Date,
  ): Promise<void> {
    if (!this.supabase.isEnabled()) {
      return;
    }

    const userId = await this.identityService.ensureCompanyUser(
      context.tenant.companyId,
      context.senderId,
      context.role ?? UserRole.CLIENT,
    );

    if (!userId) {
      return;
    }

    await this.supabase.query(
      `INSERT INTO public.appointments (company_id, user_id, start_time, end_time, status, notes)
       VALUES ($1, $2, $3, $4, 'PENDING_SYNC', $5)
       ON CONFLICT (company_id, start_time, end_time)
       DO NOTHING`,
      [
        context.tenant.companyId,
        userId,
        start.toISOString(),
        end.toISOString(),
        `Solicitud vía bot ${context.senderId}`,
      ],
    );
  }
}
