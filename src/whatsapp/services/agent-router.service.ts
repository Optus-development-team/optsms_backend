import { Injectable, Logger } from '@nestjs/common';
import { AppointmentAgentService } from '../agents/appointment-agent.service';
import { ReportingAgentService } from '../agents/reporting-agent.service';
import { SalesAgentService } from '../agents/sales-agent.service';
import { SanitizationService } from './sanitization.service';
import {
  AgentResponse,
  Intent,
  RouterMessageContext,
  RouterResult,
  UserRole,
} from '../whatsapp.types';
import { OnboardingService } from './onboarding.service';

@Injectable()
export class AgentRouterService {
  private readonly logger = new Logger(AgentRouterService.name);
  private readonly adminOnlyIntents = new Set<Intent>([
    Intent.REPORTING,
    Intent.TWO_FA,
  ]);

  constructor(
    private readonly sanitizationService: SanitizationService,
    private readonly appointmentAgent: AppointmentAgentService,
    private readonly salesAgent: SalesAgentService,
    private readonly reportingAgent: ReportingAgentService,
    private readonly onboardingService: OnboardingService,
  ) {}

  async routeTextMessage(context: RouterMessageContext): Promise<RouterResult> {
    const sanitized = this.sanitizationService.sanitize(context.originalText);

    const onboarding = await this.onboardingService.run(context);
    if (onboarding) {
      return {
        role: context.role,
        intent: 'FALLBACK',
        sanitized,
        ...onboarding,
      };
    }

    const intent = this.detectIntent(sanitized.normalizedText);
    const role = context.role;

    if (!intent) {
      return {
        role,
        intent: 'FALLBACK',
        sanitized,
        actions: [
          {
            type: 'text',
            text: 'No identifiqué la intención. Usa palabras como *cita*, *pagar*, *reporte* o *token* para enrutarte al agente correcto.',
          },
        ],
      };
    }

    if (this.adminOnlyIntents.has(intent) && role !== UserRole.ADMIN) {
      return {
        role,
        intent,
        sanitized,
        actions: [
          {
            type: 'text',
            text: 'Esta acción requiere permisos de administrador. Si necesitas soporte, contacta al número autorizado.',
          },
        ],
      };
    }

    let agentResponse: AgentResponse;

    switch (intent) {
      case Intent.BOOKING:
        agentResponse = await this.appointmentAgent.handle(context, sanitized);
        break;
      case Intent.SHOPPING:
        agentResponse = await this.salesAgent.handleShoppingIntent(
          context,
          sanitized,
        );
        break;
      case Intent.REPORTING:
        agentResponse = await this.reportingAgent.handle(context, sanitized);
        break;
      case Intent.TWO_FA:
        agentResponse = await this.salesAgent.handleTwoFactorReply(
          context,
          sanitized,
        );
        break;
      default:
        agentResponse = {
          actions: [
            {
              type: 'text',
              text: 'Operación no soportada por el orquestador.',
            },
          ],
        };
    }

    this.logger.debug(
      `Intent ${intent} atendido por ${agentResponse.metadata ? 'agente especializado' : 'router'}`,
    );

    return {
      role,
      intent,
      sanitized,
      ...agentResponse,
    };
  }

  private detectIntent(text: string): Intent | null {
    if (/(cita|agenda|agendar|calendario|reprogramar)/.test(text)) {
      return Intent.BOOKING;
    }
    if (
      /(carrito|comprar|venta|pagar|qr|pedido|orden|checkout|generar)/.test(
        text,
      )
    ) {
      return Intent.SHOPPING;
    }
    if (/(reporte|reporting|kpi|estadistic|inventario|dashboard)/.test(text)) {
      return Intent.REPORTING;
    }
    if (/(token|2fa|codigo|código|factor)/.test(text)) {
      return Intent.TWO_FA;
    }
    return null;
  }
}
