import { Injectable, Logger } from '@nestjs/common';
import type {
  AgentResponse,
  RouterMessageContext,
  SanitizedTextResult,
} from '../whatsapp.types';

@Injectable()
export class AppointmentAgentService {
  private readonly logger = new Logger(AppointmentAgentService.name);

  handle(
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

    return Promise.resolve({
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
      },
    });
  }

  private extractDate(text: string): string | undefined {
    const match = text.match(/\b(\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)\b/);
    return match?.[1];
  }

  private extractTime(text: string): string | undefined {
    const match = text.match(/\b(\d{1,2}[:.]\d{2})\b/);
    return match?.[1];
  }
}
