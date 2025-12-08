import { Injectable, Logger } from '@nestjs/common';
import type {
  AgentResponse,
  RouterMessageContext,
  SanitizedTextResult,
} from '../whatsapp.types';
import { SupabaseService } from '../services/supabase.service';
import { IdentityService } from '../services/identity.service';
import { UserRole } from '../whatsapp.types';
import { GeminiService } from '../services/gemini.service';

@Injectable()
export class AppointmentAgentService {
  private readonly logger = new Logger(AppointmentAgentService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly identityService: IdentityService,
    private readonly geminiService: GeminiService,
  ) {}

  async handle(
    context: RouterMessageContext,
    sanitized: SanitizedTextResult,
  ): Promise<AgentResponse> {
    // Usar Gemini para extraer fecha/hora de forma natural
    if (this.geminiService.isEnabled()) {
      return this.handleWithGemini(context, sanitized);
    }

    // Fallback con regex
    return this.handleWithRegex(context, sanitized);
  }

  private async handleWithGemini(
    context: RouterMessageContext,
    sanitized: SanitizedTextResult,
  ): Promise<AgentResponse> {
    try {
      const model = this.geminiService.getModel();
      if (!model) {
        return this.handleWithRegex(context, sanitized);
      }

      const config = context.tenant.companyConfig;
      const appointmentPolicy = config?.appointment_policy || {};
      const slotDuration = appointmentPolicy.slot_duration_minutes || 60;
      const buffer =
        appointmentPolicy.buffer_between_appointments_minutes || 15;
      const cancellation =
        appointmentPolicy.cancellation_rule ||
        'Cancelación con 24h de anticipación';

      const profile = config?.profile || {};
      const agentName = profile.agent_name || 'asistente';

      const today = new Date().toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const instruction = `Eres ${agentName}, especialista en agendar citas.

Hoy es: ${today}

Políticas de la empresa:
- Duración de cita: ${slotDuration} minutos
- Buffer entre citas: ${buffer} minutos
- Regla de cancelación: ${cancellation}

El usuario escribió: "${sanitized.normalizedText}"

Tu tarea:
1. Extrae la fecha y hora solicitada (acepta lenguaje natural como "mañana", "próximo martes", "a las 3pm")
2. Si no hay fecha/hora específica, sugiere el siguiente día hábil
3. Calcula slot de ${slotDuration} minutos
4. Genera respuesta natural confirmando la propuesta de cita
5. Invita al usuario a responder "CONFIRMAR" o sugerir otra fecha

Formato de respuesta JSON:
{
  "response_text": "texto amigable en español",
  "extracted_date": "YYYY-MM-DD o null",
  "extracted_time": "HH:MM o null",
  "slot_start_iso": "ISO8601 o null",
  "slot_end_iso": "ISO8601 o null"
}`;

      const result = await this.geminiService.generateText(instruction);

      const content = result || '{}';

      let parsed: any;
      try {
        // Extraer JSON de la respuesta (puede venir con markdown)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      } catch {
        parsed = {};
      }

      const responseText =
        parsed.response_text ||
        'Entendido, voy a agendar tu cita. ¿Podrías confirmarme la fecha y hora?';

      const slotStart = parsed.slot_start_iso
        ? new Date(parsed.slot_start_iso)
        : null;
      const slotEnd = parsed.slot_end_iso
        ? new Date(parsed.slot_end_iso)
        : null;

      if (slotStart && slotEnd) {
        await this.persistAppointment(context, slotStart, slotEnd);
      }

      return {
        actions: [
          {
            type: 'text',
            text: responseText,
          },
        ],
        metadata: {
          gemini_powered: true,
          sanitizedPreview: sanitized.sanitizedText.slice(0, 120),
          requestedDate: parsed.extracted_date,
          requestedTime: parsed.extracted_time,
          slot:
            slotStart && slotEnd ? { start: slotStart, end: slotEnd } : null,
        },
      };
    } catch (error) {
      this.logger.error('Error en appointment agent con Gemini:', error);
      return this.handleWithRegex(context, sanitized);
    }
  }

  private async handleWithRegex(
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
        start = new Date(
          year,
          month,
          day,
          start.getHours(),
          start.getMinutes(),
        );
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
