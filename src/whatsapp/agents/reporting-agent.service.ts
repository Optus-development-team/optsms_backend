import { Injectable } from '@nestjs/common';
import type {
  AgentResponse,
  RouterMessageContext,
  SanitizedTextResult,
} from '../whatsapp.types';

@Injectable()
export class ReportingAgentService {
  handle(
    context: RouterMessageContext,
    sanitized: SanitizedTextResult,
  ): Promise<AgentResponse> {
    const snapshots = this.buildInstantMetrics();

    return Promise.resolve({
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
    });
  }

  private buildInstantMetrics() {
    return {
      salesToday: '$0 (modo demo)',
      lowStock: 'Sincronización pendiente',
      activeAppointments: 0,
    };
  }
}
