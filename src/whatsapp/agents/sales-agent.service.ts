import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  AgentResponse,
  PaymentOrder,
  RouterMessageContext,
  RouterAction,
  SanitizedTextResult,
} from '../whatsapp.types';
import { PaymentState, UserRole } from '../whatsapp.types';
import { PaymentClientService } from '../services/payment-client.service';
import { IdentityService } from '../services/identity.service';
import type {
  PaymentWebhookDto,
  PaymentWebhookAction,
} from '../dto/payment-webhook.dto';
import { OrdersSyncService } from '../services/orders-sync.service';
import { CompanyIntegrationsService } from '../services/company-integrations.service';
import { GeminiService } from '../services/gemini.service';

@Injectable()
export class SalesAgentService {
  private readonly logger = new Logger(SalesAgentService.name);
  private readonly ordersByClient = new Map<string, PaymentOrder>();
  private readonly ordersById = new Map<string, PaymentOrder>();

  constructor(
    private readonly paymentClient: PaymentClientService,
    private readonly identityService: IdentityService,
    private readonly ordersSyncService: OrdersSyncService,
    private readonly companyIntegrations: CompanyIntegrationsService,
    private readonly geminiService: GeminiService,
  ) {}

  async handleShoppingIntent(
    context: RouterMessageContext,
    sanitized: SanitizedTextResult,
  ): Promise<AgentResponse> {
    const clientKey = this.buildClientKey(
      context.tenant.companyId,
      context.senderId,
    );
    let order = this.ordersByClient.get(clientKey);

    if (!order || order.state === PaymentState.COMPLETED) {
      order = this.createOrder(context.tenant.companyId, context.senderId);
      this.ordersByClient.set(clientKey, order);
    }

    if (order.companyId !== context.tenant.companyId) {
      order = this.createOrder(context.tenant.companyId, context.senderId);
      this.ordersByClient.set(clientKey, order);
    }

    this.logger.debug(`Estado actual ${order.state} para ${context.senderId}`);

    // Usar Gemini para extraer monto con lenguaje natural
    const amount = await this.extractAmountWithGemini(
      sanitized.normalizedText,
      context,
    );

    if (amount && order.amount !== amount) {
      order.amount = amount;
      order.lastUpdate = new Date();
      await this.ensureOrderUser(order, context.role);
      order.supabaseOrderId = await this.ordersSyncService.syncDraft(order);
    }

    await this.ensureOrderUser(order, context.role);

    // Usar Gemini para detectar intención (pagar, consultar estado, etc.)
    const intent = await this.detectShoppingIntentWithGemini(
      sanitized.normalizedText,
      order.state,
      context,
    );

    const actions: RouterAction[] = [];

    if (!order.amount) {
      const response = await this.generateGeminiResponse(
        context,
        'El usuario no ha especificado un monto. Pídele amablemente que indique el monto total a pagar.',
        order.state,
      );
      actions.push({
        type: 'text',
        text: response,
      });
      return { actions };
    }

    if (intent === 'checkout' && order.state === PaymentState.CART) {
      const response = await this.generateGeminiResponse(
        context,
        'El usuario quiere generar el código QR para pagar. Confirma que estás procesando su solicitud.',
        order.state,
      );
      actions.push({
        type: 'text',
        text: response,
      });

      await this.paymentClient.generateQr(
        order.companyId,
        order.orderId,
        order.amount,
        order.details,
      );
      order.state = PaymentState.AWAITING_QR;
      order.lastUpdate = new Date();
      await this.ordersSyncService.updateStatus(order);

      actions.push({
        type: 'text',
        text: 'En segundos recibirás la imagen del QR. Te aviso apenas llegue del banco.',
      });
      return { actions };
    }

    if (intent === 'confirm_paid' && order.state === PaymentState.QR_SENT) {
      const response = await this.generateGeminiResponse(
        context,
        'El usuario confirma que ya realizó el pago. Indica que estás verificando con el banco.',
        order.state,
      );
      actions.push({
        type: 'text',
        text: response,
      });

      order.state = PaymentState.VERIFYING;
      order.lastUpdate = new Date();
      await this.paymentClient.verifyPayment(
        order.companyId,
        order.orderId,
        order.details,
      );
      await this.ordersSyncService.updateStatus(order);

      actions.push({
        type: 'text',
        text: 'Verificando con el banco... esto puede tardar hasta 60 segundos.',
      });
      return { actions };
    }

    if (intent === 'status') {
      const stateText = this.translateState(order.state);
      const response = await this.generateGeminiResponse(
        context,
        `El usuario consulta el estado. La orden ${order.orderId} está en estado: ${stateText}`,
        order.state,
      );
      actions.push({
        type: 'text',
        text: response,
      });
      return { actions };
    }

    // Respuesta por defecto con Gemini
    const defaultResponse = await this.generateGeminiResponse(
      context,
      `El usuario escribió algo relacionado con compras pero no detectamos una acción clara. Estado actual: ${order.state}. Sugiere opciones amablemente.`,
      order.state,
    );

    return {
      actions: [
        {
          type: 'text',
          text: defaultResponse,
        },
      ],
    };
  }

  private async extractAmountWithGemini(
    text: string,
    _context: RouterMessageContext,
  ): Promise<number | undefined> {
    if (!this.geminiService.isEnabled()) {
      return this.extractAmount(text);
    }

    try {
      const model = this.geminiService.getModel();
      if (!model) {
        return this.extractAmount(text);
      }

      const instruction = `Extrae el monto monetario del texto. Acepta formatos naturales.

Ejemplos:
- "quiero pagar 1500" → 1500
- "serían 25 dólares" → 25
- "son dos mil pesos" → 2000
- "total 450.50" → 450.50

Texto: "${text}"

Responde SOLO con el número (sin símbolos de moneda) o "null" si no hay monto.`;

      const result = await this.geminiService.generateText(instruction);

      const content = result?.trim() || null;
      if (!content || content === 'null') {
        return undefined;
      }

      const parsed = parseFloat(content);
      return isNaN(parsed) ? undefined : parsed;
    } catch (error) {
      this.logger.error('Error extrayendo monto con Gemini:', error);
      return this.extractAmount(text);
    }
  }

  private async detectShoppingIntentWithGemini(
    text: string,
    currentState: PaymentState,
    _context: RouterMessageContext,
  ): Promise<'checkout' | 'confirm_paid' | 'status' | 'other'> {
    if (!this.geminiService.isEnabled()) {
      return this.detectShoppingIntentFallback(text);
    }

    try {
      const model = this.geminiService.getModel();
      if (!model) {
        return this.detectShoppingIntentFallback(text);
      }

      const instruction = `Detecta la intención del usuario en el contexto de una compra.

Estado actual de la orden: ${currentState}

Intenciones posibles:
- checkout: Usuario quiere generar QR, pagar ahora, proceder al checkout
- confirm_paid: Usuario dice que ya pagó, confirma pago
- status: Usuario pregunta el estado de su orden
- other: Cualquier otra cosa

Texto: "${text}"

Responde SOLO con una palabra: checkout, confirm_paid, status, other`;

      const result = await this.geminiService.generateText(instruction);

      const content = result?.trim().toLowerCase() || '';

      if (content.includes('checkout')) return 'checkout';
      if (content.includes('confirm_paid')) return 'confirm_paid';
      if (content.includes('status')) return 'status';

      return 'other';
    } catch (error) {
      this.logger.error(
        'Error detectando intent de shopping con Gemini:',
        error,
      );
      return this.detectShoppingIntentFallback(text);
    }
  }

  private detectShoppingIntentFallback(
    text: string,
  ): 'checkout' | 'confirm_paid' | 'status' | 'other' {
    if (/(pagar|checkout|qr|cobrar|generar)/.test(text)) {
      return 'checkout';
    }
    if (/(ya pague|ya pagué|listo|pagado|confirmo)/.test(text)) {
      return 'confirm_paid';
    }
    if (/(estatus|estado|cómo va|como va)/.test(text)) {
      return 'status';
    }
    return 'other';
  }

  private async generateGeminiResponse(
    context: RouterMessageContext,
    situation: string,
    orderState: PaymentState,
  ): Promise<string> {
    if (!this.geminiService.isEnabled()) {
      return this.generateFallbackResponse(situation);
    }

    try {
      const model = this.geminiService.getModel();
      if (!model) {
        return this.generateFallbackResponse(situation);
      }

      const config = context.tenant.companyConfig;
      const profile = config?.profile || {};
      const salesPolicy = config?.sales_policy || {};

      const agentName = profile.agent_name || 'asistente de ventas';
      const tone = profile.tone || 'amigable y profesional';

      const instruction = `Eres ${agentName}, especialista en ventas. Tu tono es ${tone}.

Políticas de la empresa:
${salesPolicy.delivery_cost ? `- Costo de envío: ${salesPolicy.delivery_cost}` : ''}
${salesPolicy.refund_policy ? `- Política de devolución: ${salesPolicy.refund_policy}` : ''}
${salesPolicy.accepted_payment_methods ? `- Métodos de pago: ${(salesPolicy.accepted_payment_methods as string[]).join(', ')}` : ''}

Situación actual: ${situation}
Estado de la orden: ${orderState}

Genera una respuesta natural, breve (máximo 2 líneas) y útil en español.`;

      const result = await this.geminiService.generateText(instruction);

      return result || this.generateFallbackResponse(situation);
    } catch (error) {
      this.logger.error('Error generando respuesta con Gemini:', error);
      return this.generateFallbackResponse(situation);
    }
  }

  private generateFallbackResponse(situation: string): string {
    if (situation.includes('no ha especificado un monto')) {
      return 'Para preparar tu orden necesito el monto total. Escribe por ejemplo: *Pagar 1500 MXN*.';
    }
    if (situation.includes('generar el código QR')) {
      return 'Generando tu código QR con el banco...';
    }
    if (situation.includes('confirma que ya realizó el pago')) {
      return 'Perfecto, pidiéndole al banco que confirme...';
    }
    return 'Estoy cuidando tu carrito. Escribe *Pagar* para generar el QR.';
  }

  private translateState(state: PaymentState): string {
    const translations: Record<PaymentState, string> = {
      [PaymentState.CART]: 'En carrito',
      [PaymentState.AWAITING_QR]: 'Esperando QR del banco',
      [PaymentState.QR_SENT]: 'QR enviado, esperando pago',
      [PaymentState.VERIFYING]: 'Verificando pago con el banco',
      [PaymentState.COMPLETED]: 'Pago completado',
    };
    return translations[state] || state;
  }

  async handleTwoFactorReply(
    context: RouterMessageContext,
    sanitized: SanitizedTextResult,
  ): Promise<AgentResponse> {
    const adminCodeMatch = sanitized.sanitizedText.match(/\b\d{4,8}\b/);
    if (!adminCodeMatch) {
      return {
        actions: [
          {
            type: 'text',
            text: 'Necesito el código numérico que envió el banco (4 a 8 dígitos).',
          },
        ],
      };
    }

    const pendingOrder = [...this.ordersById.values()].find(
      (order) =>
        order.awaitingTwoFa && order.companyId === context.tenant.companyId,
    );
    if (!pendingOrder) {
      return {
        actions: [
          {
            type: 'text',
            text: 'No hay una verificación pendiente. Espera a que el banco solicite un nuevo código.',
          },
        ],
      };
    }

    const code = adminCodeMatch[0];
    const delivered = await this.paymentClient.submitTwoFactor(
      context.tenant.companyId,
      code,
    );
    if (delivered) {
      pendingOrder.awaitingTwoFa = false;
      pendingOrder.state = PaymentState.VERIFYING;
      await this.companyIntegrations.markTwoFactorAttention(
        pendingOrder.companyId,
        false,
      );
      await this.ordersSyncService.updateStatus(pendingOrder);
    }

    return {
      actions: [
        {
          type: 'text',
          text: delivered
            ? 'Código enviado. El banco reanudará la verificación automáticamente.'
            : 'El banco rechazó el código. Intenta nuevamente.',
        },
      ],
    };
  }

  async handlePaymentWebhook(
    payload: PaymentWebhookDto,
  ): Promise<PaymentWebhookAction[]> {
    const order = this.ordersById.get(payload.order_id);
    if (!order) {
      this.logger.warn(
        `Orden ${payload.order_id} no localizada para evento ${payload.event_type}`,
      );
      return [];
    }

    order.lastUpdate = new Date();

    switch (payload.event_type) {
      case 'QR_GENERATED':
        order.state = PaymentState.QR_SENT;
        await this.ordersSyncService.updateStatus(order);
        return [
          {
            companyId: order.companyId,
            to: order.clientPhone,
            type: 'text',
            text: '¡Tu QR está listo! Escanéalo desde tu app bancaria y confirma cuando hayas pagado.',
          },
          {
            companyId: order.companyId,
            to: order.clientPhone,
            type: 'image',
            imageBase64: payload.qr_image_base64,
            mimeType: payload.mime_type ?? 'image/png',
            caption: `Orden ${order.orderId}`,
          },
        ];
      case 'VERIFICATION_RESULT':
        if (payload.success) {
          order.state = PaymentState.COMPLETED;
          await this.companyIntegrations.markTwoFactorAttention(
            order.companyId,
            false,
          );
          await this.ordersSyncService.updateStatus(order);
          return [
            {
              companyId: order.companyId,
              to: order.clientPhone,
              type: 'text',
              text: '✅ Pago confirmado. ¿Deseas agendar la entrega? Escribe *Agendar entrega* y lo coordinamos.',
            },
          ];
        }
        order.state = PaymentState.CART;
        await this.ordersSyncService.updateStatus(order);
        return [
          {
            companyId: order.companyId,
            to: order.clientPhone,
            type: 'text',
            text: 'El banco no pudo confirmar el pago. ¿Deseas que reintente o generar un nuevo QR?',
          },
        ];
      case 'LOGIN_2FA_REQUIRED': {
        order.awaitingTwoFa = true;
        order.state = PaymentState.VERIFYING;
        await this.companyIntegrations.markTwoFactorAttention(
          order.companyId,
          true,
        );
        await this.ordersSyncService.updateStatus(order);
        const actions: PaymentWebhookAction[] = [
          {
            companyId: order.companyId,
            to: order.clientPhone,
            type: 'text',
            text: 'El banco pidió una verificación adicional. Un momento mientras validamos seguridad...',
          },
        ];
        const adminPhones = await this.identityService.getAdminPhones(
          order.companyId,
        );
        for (const phone of adminPhones) {
          actions.push({
            companyId: order.companyId,
            to: phone,
            type: 'text',
            text: `⚠️ [${order.companyId}] El banco pide el Token de seguridad. Responde con el código numérico.`,
          });
        }
        return actions;
      }
      default:
        return [];
    }
  }

  private createOrder(companyId: string, clientPhone: string): PaymentOrder {
    const order: PaymentOrder = {
      orderId: randomUUID(),
      clientPhone,
      state: PaymentState.CART,
      details: `REF-${companyId.slice(0, 8)}-${Date.now()}`,
      lastUpdate: new Date(),
      companyId,
    };

    this.ordersById.set(order.orderId, order);
    return order;
  }

  private async ensureOrderUser(
    order: PaymentOrder,
    role: UserRole,
  ): Promise<void> {
    if (order.userId) {
      return;
    }

    const userId = await this.identityService.ensureCompanyUser(
      order.companyId,
      order.clientPhone,
      role,
    );

    if (userId) {
      order.userId = userId;
    }
  }

  private buildClientKey(companyId: string, clientPhone: string): string {
    return `${companyId}:${clientPhone}`;
  }

  private extractAmount(text: string): number | undefined {
    const match = text.match(/(?:\$|mxn|usd|cop)?\s*(\d+(?:[.,]\d+)?)/);
    if (!match) return undefined;
    return Number(match[1].replace(',', '.'));
  }
}
