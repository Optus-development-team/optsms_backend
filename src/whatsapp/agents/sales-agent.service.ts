import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  AgentResponse,
  PaymentOrder,
  RouterMessageContext,
  RouterAction,
  SanitizedTextResult,
  SalesToolType,
  SalesToolResult,
  X402NegotiationData,
  X402SettlementData,
  ChatHistoryItem,
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
import { MetaCatalogService } from '../services/meta-catalog.service';
import { X402PaymentClientService } from '../services/x402-payment-client.service';
import type { MetaBatchRequest } from '../dto/meta-catalog.dto';

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
    private readonly metaCatalog: MetaCatalogService,
    private readonly x402PaymentClient: X402PaymentClientService,
  ) {}

  async handleShoppingIntent(
    context: RouterMessageContext,
    sanitized: SanitizedTextResult,
  ): Promise<AgentResponse> {
    // Recuperar orden y actualizar historial primero
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

    // Asegurar historial
    if (!order.chatHistory) {
      order.chatHistory = [];
    }

    // Agregar mensaje del usuario al historial
    order.chatHistory.push({
      role: 'user',
      text: sanitized.normalizedText,
      timestamp: new Date(),
    });

    // Si hay un producto referenciado, obtener su información del catálogo
    if (context.referredProduct) {
      return this.handleReferredProduct(context, sanitized, order);
    }

    // Primero, intentar detectar y ejecutar herramientas del catálogo
    const toolResponse = await this.detectAndExecuteTool(context, sanitized);
    if (toolResponse) {
      return toolResponse;
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
      order.chatHistory,
    );

    const actions: RouterAction[] = [];

    if (!order.amount) {
      const response = await this.generateGeminiResponse(
        context,
        'El usuario no ha especificado un monto. Pídele amablemente que indique el monto total a pagar.',
        order.state,
        order.chatHistory,
      );
      actions.push({
        type: 'text',
        text: response,
      });
      order.chatHistory.push({
        role: 'model',
        text: response,
        timestamp: new Date(),
      });
      return { actions };
    }

    if (intent === 'checkout' && order.state === PaymentState.CART) {
      return this.processCheckout(context, order);
    }

    if (intent === 'confirm_paid' && order.state === PaymentState.QR_SENT) {
      const response = await this.generateGeminiResponse(
        context,
        'El usuario confirma que ya realizó el pago. Indica que estás verificando con el banco.',
        order.state,
        order.chatHistory,
      );
      actions.push({
        type: 'text',
        text: response,
      });
      order.chatHistory.push({
        role: 'model',
        text: response,
        timestamp: new Date(),
      });

      order.state = PaymentState.VERIFYING;
      order.lastUpdate = new Date();

      // Verificar pago con x402 (flujo fiat)
      const verifyResult = await this.x402PaymentClient.verifyFiatPayment({
        orderId: order.orderId,
        amountUsd: order.amount!,
        details: order.details,
      });

      if (verifyResult.ok && verifyResult.settlement?.success) {
        // Pago confirmado exitosamente
        order.state = PaymentState.COMPLETED;
        order.x402Settlement = verifyResult.settlement as X402SettlementData;
        await this.companyIntegrations.markTwoFactorAttention(
          order.companyId,
          false,
        );
        await this.ordersSyncService.updateStatus(order);

        const successMsg =
          '✅ ¡Pago confirmado! Gracias por tu compra. ¿Deseas agendar la entrega? Escribe *Agendar entrega* y lo coordinamos.';
        actions.push({
          type: 'text',
          text: successMsg,
        });
        order.chatHistory.push({
          role: 'model',
          text: successMsg,
          timestamp: new Date(),
        });
        return { actions };
      }

      // Pago no confirmado aún - mantener en verificación
      await this.ordersSyncService.updateStatus(order);
      const waitMsg =
        'Verificando con el banco... esto puede tardar hasta 60 segundos. Te avisaré cuando se confirme.';
      actions.push({
        type: 'text',
        text: waitMsg,
      });
      order.chatHistory.push({
        role: 'model',
        text: waitMsg,
        timestamp: new Date(),
      });
      return { actions };
    }

    if (intent === 'status') {
      const stateText = this.translateState(order.state);
      const response = await this.generateGeminiResponse(
        context,
        `El usuario consulta el estado. La orden ${order.orderId} está en estado: ${stateText}`,
        order.state,
        order.chatHistory,
      );
      actions.push({
        type: 'text',
        text: response,
      });
      order.chatHistory.push({
        role: 'model',
        text: response,
        timestamp: new Date(),
      });
      return { actions };
    }

    // Respuesta por defecto con Gemini
    const defaultResponse = await this.generateGeminiResponse(
      context,
      `El usuario escribió algo relacionado con compras pero no detectamos una acción clara. Estado actual: ${order.state}. Sugiere opciones amablemente.`,
      order.state,
      order.chatHistory,
    );

    order.chatHistory.push({
      role: 'model',
      text: defaultResponse,
      timestamp: new Date(),
    });

    return {
      actions: [
        {
          type: 'text',
          text: defaultResponse,
        },
      ],
    };
  }

  /**
   * Maneja mensajes que vienen desde un producto específico del catálogo de WhatsApp.
   * Obtiene la información del producto usando la API de Meta Catalog y responde
   * con los detalles del producto.
   */
  private async handleReferredProduct(
    context: RouterMessageContext,
    sanitized: SanitizedTextResult,
    order: PaymentOrder,
  ): Promise<AgentResponse> {
    const { referredProduct } = context;
    if (!referredProduct) {
      return {
        actions: [
          {
            type: 'text',
            text: 'No se pudo identificar el producto. ¿Podrías indicarme cuál te interesa?',
          },
        ],
      };
    }

    this.logger.log(
      `Procesando producto referenciado: ${referredProduct.productRetailerId}`,
    );

    // Obtener información del producto desde Meta Catalog
    const productInfo = await this.metaCatalog.getProductInfo(
      referredProduct.catalogId,
      referredProduct.productRetailerId,
    );

    if (!productInfo?.data?.[0]) {
      this.logger.warn(
        `Producto ${referredProduct.productRetailerId} no encontrado en catálogo`,
      );
      return {
        actions: [
          {
            type: 'text',
            text: 'No pude encontrar información de ese producto. ¿Te gustaría ver otros productos disponibles?',
          },
        ],
      };
    }

    const product = productInfo.data[0];

    this.logger.debug(
      `Producto obtenido del catálogo: ${JSON.stringify(product)}`,
    );

    // Inicializar historial si no existe
    if (!order.chatHistory) {
      order.chatHistory = [];
    }

    // Agregar mensaje del usuario al historial
    order.chatHistory.push({
      role: 'user',
      text: sanitized.normalizedText,
      timestamp: new Date(),
    });

    // Guardar referencia del producto en la orden y resetear estado
    order.referredProductId = referredProduct.productRetailerId;
    order.referredCatalogId = referredProduct.catalogId;
    order.state = PaymentState.CART;
    order.details = `Compra de ${product.name}`;

    // Extraer precio del producto (formato: "Bs.400,00", "150.00 BOB", "$150", etc.)
    let extractedPrice: number | undefined;
    if (product.price) {
      // Eliminar símbolos de moneda y espacios, luego extraer números
      const cleanPrice = product.price.replace(/[^\d,.]/g, '').trim();
      const priceMatch = cleanPrice.match(/([\d,]+(?:\.[\d]+)?|[\d]+(?:,[\d]+)?)/);
      if (priceMatch) {
        // Si usa coma como separador decimal (ej: 400,00), convertir a punto
        let priceStr = priceMatch[1];
        // Si tiene formato 1.234,56 o 1,234.56, determinar cuál es el separador decimal
        const hasCommaDecimal = priceStr.includes(',') && priceStr.lastIndexOf(',') > priceStr.lastIndexOf('.');
        if (hasCommaDecimal) {
          // Formato europeo: 1.234,56 -> eliminar puntos, reemplazar coma por punto
          priceStr = priceStr.replace(/\./g, '').replace(',', '.');
        } else {
          // Formato americano: 1,234.56 -> solo eliminar comas
          priceStr = priceStr.replace(/,/g, '');
        }
        extractedPrice = parseFloat(priceStr);
      }
    }
    this.logger.debug(
      `Precio del producto: ${product.price}, extraído: ${extractedPrice}`,
    );

    if (extractedPrice && extractedPrice > 0) {
      order.amount = extractedPrice;
    }

    order.lastUpdate = new Date();
    await this.ensureOrderUser(order, context.role);
    order.supabaseOrderId = await this.ordersSyncService.syncDraft(order);

    // Detectar si el usuario quiere comprar directamente
    const userText = sanitized.normalizedText.toLowerCase();
    const wantsToPayNow =
      /(comprar|pagar|link de pago|generar|qr|checkout|quiero este|lo quiero|me lo llevo)/i.test(
        userText,
      );

    this.logger.debug(
      `Producto referenciado - wantsToPayNow: ${wantsToPayNow}, amount: ${order.amount}`,
    );

    // Si el usuario quiere pagar y tenemos precio, generar QR/link directamente
    if (wantsToPayNow && order.amount) {
      return this.processCheckout(context, order);
    }

    // Si no quiere pagar aún o no hay precio, mostrar info y preguntar
    const productDescription = `
Producto: ${product.name}
Precio: ${product.price}
Disponibilidad: ${product.availability === 'in stock' ? 'Disponible' : 'No disponible'}
${product.description ? `Descripción: ${product.description}` : ''}
`;

    const response = await this.generateGeminiResponse(
      context,
      `El usuario pregunta por el producto "${product.name}". Información: ${productDescription}. Pregunta del usuario: "${sanitized.normalizedText}". Responde amablemente con la información del producto y pregunta si desea comprarlo.`,
      order.state,
      order.chatHistory,
    );

    order.chatHistory!.push({
      role: 'model',
      text: response,
      timestamp: new Date(),
    });

    return {
      actions: [
        {
          type: 'text',
          text: response,
        },
      ],
    };
  }

  /**
   * Procesa el checkout: genera QR/link de pago y lo envía al usuario.
   */
  private async processCheckout(
    context: RouterMessageContext,
    order: PaymentOrder,
  ): Promise<AgentResponse> {
    const actions: RouterAction[] = [];

    // Validar que tengamos un monto antes de proceder
    if (!order.amount || order.amount <= 0) {
      this.logger.warn(
        `processCheckout llamado sin monto válido para orden ${order.orderId}`,
      );
      const errorMsg =
        'Para generar el pago necesito el monto total. ¿Cuánto es el total a pagar?';
      actions.push({ type: 'text', text: errorMsg });
      order.chatHistory?.push({
        role: 'model',
        text: errorMsg,
        timestamp: new Date(),
      });
      return { actions };
    }

    this.logger.log(
      `Procesando checkout para orden ${order.orderId}, monto: ${order.amount}`,
    );

    // Asegurar que tenemos el ID de Supabase antes de generar el pago
    if (!order.supabaseOrderId) {
      order.supabaseOrderId = await this.ordersSyncService.syncDraft(order);
    }

    // Usar nuevo flujo x402 para iniciar el pago con el ID de Supabase
    const x402Result = await this.x402PaymentClient.initiatePayment({
      orderId: order.supabaseOrderId || order.orderId,
      amountUsd: order.amount,
      description: order.details,
      resource: 'Orden de compra',
      fiatAmount: order.amount,
      currency: 'BOB',
      symbol: 'Bs.',
    });

    if (!x402Result.ok || !x402Result.negotiation) {
      this.logger.error(`Error iniciando pago x402: ${x402Result.error}`);
      const errorMsg =
        'Hubo un problema generando el QR. Por favor intenta nuevamente.';
      actions.push({
        type: 'text',
        text: errorMsg,
      });
      order.chatHistory?.push({
        role: 'model',
        text: errorMsg,
        timestamp: new Date(),
      });
      return { actions };
    }

    // Guardar datos de x402 en la orden
    order.x402JobId = x402Result.jobId;
    order.paymentUrl = x402Result.paymentUrl;
    order.x402Negotiation = x402Result.negotiation as X402NegotiationData;
    order.state = PaymentState.QR_SENT;
    order.lastUpdate = new Date();

    // Sincronizar con Supabase incluyendo metadata de x402
    await this.ordersSyncService.updateStatus(order);

    // Log para debug
    this.logger.debug(`QR recibido del x402: ${!!x402Result.qrImageBase64}, longitud: ${x402Result.qrImageBase64?.length || 0}`);

    // Enviar QR+link usando SOLO mensaje interactivo CTA URL con imagen en header
    if (x402Result.qrImageBase64) {
      const bodyText = `🛒 *${order.details}*\n💰 *Total a pagar:* Bs. ${order.amount?.toFixed(2)}\n\n📱 Escanea el código QR o presiona el botón para completar tu pago de forma segura.`;
      
      order.chatHistory?.push({
        role: 'model',
        text: bodyText,
        timestamp: new Date(),
      });

      // Enviar SOLO mensaje interactivo con QR en header y botón CTA
      return {
        actions: [],
        metadata: {
          sendInteractiveCtaUrlWithQr: true,
          to: context.senderId,
          qrBase64: x402Result.qrImageBase64,
          bodyText,
          footerText: `Ref: ${order.details}`,
          buttonDisplayText: '💳 Completar Pago',
          buttonUrl: x402Result.paymentUrl!,
        },
      };
    }

    // Si no hay QR (solo crypto disponible), enviar mensaje CTA con header de texto
    const bodyText = `🛒 *${order.details}*\n💰 Total: Bs. ${order.amount?.toFixed(2)}\n\n✅ Tu orden está lista. Presiona el botón para completar el pago.`;
    
    order.chatHistory?.push({
      role: 'model',
      text: bodyText,
      timestamp: new Date(),
    });
    
    return {
      actions: [],
      metadata: {
        sendInteractiveCtaUrl: true,
        to: context.senderId,
        bodyText,
        footerText: `Ref: ${order.details}`,
        buttonDisplayText: '💳 Completar Pago',
        buttonUrl: x402Result.paymentUrl!,
      },
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
    history: ChatHistoryItem[] = [],
  ): Promise<'checkout' | 'confirm_paid' | 'status' | 'other'> {
    // Fallback rápido para confirmaciones simples cuando hay producto en carrito
    const normalizedText = text.toLowerCase().trim();
    // Permitir variaciones como "siiii", "okkkk", etc.
    const isSimpleConfirmation = /^(si+|sí+|ok+|dale|va|yes+|claro|bueno|listo|confirmo|si+\s*pe|sip+|simón|yep+)$/i.test(
      normalizedText,
    );

    // Si es confirmación simple y hay un producto en el carrito con precio, es checkout
    if (isSimpleConfirmation && currentState === PaymentState.CART) {
      this.logger.debug(
        `Detectada confirmación simple "${text}" con estado CART -> checkout`,
      );
      return 'checkout';
    }

    if (!this.geminiService.isEnabled()) {
      return this.detectShoppingIntentFallback(text, currentState);
    }

    try {
      const model = this.geminiService.getModel();
      if (!model) {
        return this.detectShoppingIntentFallback(text, currentState);
      }

      // Construir contexto del historial para Gemini
      const historyContext =
        history.length > 0
          ? history
              .slice(-6) // últimos 6 mensajes para contexto
              .map((h) => `${h.role === 'user' ? 'Usuario' : 'Asistente'}: ${h.text}`)
              .join('\n')
          : 'Sin historial previo';

      const instruction = `Analiza el historial de conversación y el último mensaje para detectar la intención del usuario.

Estado actual de la orden: ${currentState}
Historial reciente:
${historyContext}

Último mensaje del usuario: "${text}"

Intenciones posibles:
- checkout: Usuario quiere comprar, pagar, generar QR/link de pago, o confirma una intención de compra previa (ej: "si", "ok", "dale", "si pe", "quiero", "comprar", "pagar").
- confirm_paid: Usuario dice que ya pagó o realizó la transferencia.
- status: Usuario pregunta el estado de su orden o pago.
- other: Cualquier otra cosa.

IMPORTANTE: Si el usuario respondió con una confirmación simple como "si", "ok", "dale" después de que el asistente le preguntó si desea comprar, la intención es "checkout".

Responde SOLO con una palabra: checkout, confirm_paid, status, other`;

      const result = await this.geminiService.generateText(instruction);

      const content = result?.trim().toLowerCase() || '';
      this.logger.debug(`Gemini intent detection result: ${content}`);

      if (content.includes('checkout')) return 'checkout';
      if (content.includes('confirm_paid')) return 'confirm_paid';
      if (content.includes('status')) return 'status';

      return 'other';
    } catch (error) {
      this.logger.error(
        'Error detectando intent de shopping con Gemini:',
        error,
      );
      return this.detectShoppingIntentFallback(text, currentState);
    }
  }

  private detectShoppingIntentFallback(
    text: string,
    currentState?: PaymentState,
  ): 'checkout' | 'confirm_paid' | 'status' | 'other' {
    const normalizedText = text.toLowerCase().trim();

    // Confirmaciones simples cuando hay carrito (permitir variaciones como "siiii")
    if (
      currentState === PaymentState.CART &&
      /^(si+|sí+|ok+|dale|va|yes+|claro|bueno|listo|confirmo|si+\s*pe|sip+)$/i.test(normalizedText)
    ) {
      return 'checkout';
    }

    if (/(pagar|checkout|qr|cobrar|generar|comprar|link de pago)/.test(normalizedText)) {
      return 'checkout';
    }
    if (/(ya pague|ya pagué|listo|pagado|confirmo|transferí|transferi)/.test(normalizedText)) {
      return 'confirm_paid';
    }
    if (/(estatus|estado|cómo va|como va)/.test(normalizedText)) {
      return 'status';
    }
    return 'other';
  }

  private async generateGeminiResponse(
    context: RouterMessageContext,
    situation: string,
    orderState: PaymentState,
    history: ChatHistoryItem[] = [],
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

Genera una respuesta natural, breve (máximo 2 líneas) y útil en español, considerando el historial de la conversación.`;

      const previousHistory = history.slice(0, -1).map((h) => ({
        role: h.role,
        text: h.text,
      }));
      const lastUserMessage = history[history.length - 1];
      const prompt = `${instruction}\n\nÚltimo mensaje del usuario: "${lastUserMessage?.text || ''}"`;

      const result = await this.geminiService.generateChatResponse(
        previousHistory,
        prompt,
      );

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

  /**
   * Maneja webhooks de x402 para actualizaciones de estado de pago.
   * Este método es llamado por el webhook endpoint cuando x402 notifica
   * cambios en el estado del pago (VERIFIED, SETTLED, CONFIRMED, FAILED, EXPIRED).
   */
  async handleX402Webhook(payload: {
    jobId: string;
    event: string;
    orderId?: string;
    success?: boolean;
    type?: 'fiat' | 'crypto';
    transaction?: string;
    errorReason?: string;
  }): Promise<PaymentWebhookAction[]> {
    // Buscar orden por jobId primero en memoria
    let order = [...this.ordersById.values()].find(
      (o) => o.x402JobId === payload.jobId,
    );

    // Si no está en memoria, buscar en Supabase
    if (!order && payload.orderId) {
      order = this.ordersById.get(payload.orderId);
    }

    if (!order) {
      // Intentar recuperar de Supabase por jobId
      const dbOrder = await this.ordersSyncService.findByX402JobId(payload.jobId);
      if (dbOrder) {
        this.logger.warn(
          `Orden x402 ${payload.jobId} encontrada en DB pero no en memoria. Evento: ${payload.event}`,
        );
      } else {
        this.logger.warn(
          `Orden x402 ${payload.jobId} no encontrada. Evento: ${payload.event}`,
        );
      }
      return [];
    }

    order.lastUpdate = new Date();
    const actions: PaymentWebhookAction[] = [];

    switch (payload.event) {
      case 'X402_PAYMENT_VERIFIED':
        this.logger.log(`Pago x402 verificado para orden ${order.orderId}`);
        // El pago fue verificado, esperando settlement
        break;

      case 'X402_PAYMENT_SETTLED':
        this.logger.log(`Pago x402 settled para orden ${order.orderId}`);
        // Crypto payment settled, esperando confirmación si es manual
        break;

      case 'X402_PAYMENT_CONFIRMED':
      case 'FIAT_PAYMENT_CONFIRMED':
        order.state = PaymentState.COMPLETED;
        order.x402Settlement = {
          success: true,
          type: payload.type ?? 'fiat',
          transaction: payload.transaction ?? null,
        };
        await this.companyIntegrations.markTwoFactorAttention(
          order.companyId,
          false,
        );
        await this.ordersSyncService.updateStatus(order);

        actions.push({
          companyId: order.companyId,
          to: order.clientPhone,
          type: 'text',
          text: '✅ ¡Pago confirmado exitosamente! Gracias por tu compra. ¿Deseas agendar la entrega? Escribe *Agendar entrega*.',
        });
        break;

      case 'X402_PAYMENT_FAILED':
      case 'FIAT_PAYMENT_FAILED':
        order.state = PaymentState.CART;
        order.x402Settlement = {
          success: false,
          type: payload.type ?? 'fiat',
          errorReason: payload.errorReason ?? null,
        };
        await this.ordersSyncService.updateStatus(order);

        actions.push({
          companyId: order.companyId,
          to: order.clientPhone,
          type: 'text',
          text: `❌ No se pudo confirmar el pago${payload.errorReason ? `: ${payload.errorReason}` : ''}. ¿Deseas generar un nuevo QR?`,
        });
        break;

      case 'X402_PAYMENT_EXPIRED':
        order.state = PaymentState.CART;
        order.x402JobId = undefined;
        order.x402Negotiation = undefined;
        await this.ordersSyncService.updateStatus(order);

        actions.push({
          companyId: order.companyId,
          to: order.clientPhone,
          type: 'text',
          text: '⏰ El QR de pago expiró. Escribe *Pagar* para generar uno nuevo.',
        });
        break;

      default:
        this.logger.debug(`Evento x402 no manejado: ${payload.event}`);
    }

    return actions;
  }

  async confirmOrderFromProxy(
    orderId: string,
    details?: string,
  ): Promise<PaymentWebhookAction[]> {
    let order = this.ordersById.get(orderId);

    if (!order && details) {
      order = [...this.ordersById.values()].find(
        (candidate) => candidate.details === details,
      );
    }

    if (!order) {
      this.logger.warn(
        `No se encontró la orden ${orderId} para confirmar desde MAIN_PAGE_URL`,
      );
      return [];
    }

    if (order.state === PaymentState.COMPLETED) {
      this.logger.debug(
        `Orden ${orderId} ya estaba confirmada. Se omite doble notificación`,
      );
      return [];
    }

    order.lastUpdate = new Date();
    order.state = PaymentState.COMPLETED;
    order.x402Settlement = {
      success: true,
      type: 'fiat',
      transaction: order.x402Settlement?.transaction ?? details ?? null,
    };

    await this.companyIntegrations.markTwoFactorAttention(order.companyId, false);
    await this.ordersSyncService.updateStatus(order);

    return [
      {
        companyId: order.companyId,
        to: order.clientPhone,
        type: 'text',
        text: '✅ Confirmamos tu pago desde la página de Optus. ¿Deseas agendar la entrega? Escribe *Agendar entrega* y lo coordinamos.',
      },
    ];
  }

  /**
   * Busca una orden en memoria por su x402JobId
   */
  getOrderByX402JobId(jobId: string): PaymentOrder | undefined {
    return [...this.ordersById.values()].find((o) => o.x402JobId === jobId);
  }

  private createOrder(companyId: string, clientPhone: string): PaymentOrder {
    const order: PaymentOrder = {
      orderId: randomUUID(),
      clientPhone,
      state: PaymentState.CART,
      details: `REF-${companyId.slice(0, 8)}-${Date.now()}`,
      lastUpdate: new Date(),
      companyId,
      chatHistory: [],
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

    this.logger.debug(
      `Asegurando registro de usuario ${order.clientPhone} para orden ${order.orderId}`,
    );

    const userId = await this.identityService.ensureCompanyUser(
      order.companyId,
      order.clientPhone,
      role,
    );

    if (userId) {
      order.userId = userId;
      this.logger.log(`Usuario asignado a orden: ${userId}`);
    } else {
      this.logger.warn(
        `No se pudo asignar userId a orden ${order.orderId}. La orden continuará sin usuario asignado.`,
      );
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

  // ========== HERRAMIENTAS DE CATÁLOGO META ==========

  /**
   * Ejecuta una herramienta del catálogo de Meta según el tipo especificado
   * Esta función es llamada por el LLM/Agent cuando decide usar una herramienta
   */
  async executeCatalogTool(
    toolType: SalesToolType,
    companyId: string,
    params?: Record<string, any>,
  ): Promise<SalesToolResult> {
    try {
      switch (toolType) {
        case 'sync_inventory_to_meta':
          return await this.toolSyncInventoryToMeta(companyId);

        case 'sync_inventory_from_meta':
          return await this.toolSyncInventoryFromMeta(companyId);

        case 'search_products':
          if (!params?.searchTerm) {
            return {
              success: false,
              error: 'Se requiere searchTerm para buscar productos',
            };
          }
          return await this.toolSearchProducts(
            companyId,
            params.searchTerm as string,
          );

        case 'get_product_info':
          if (!params?.productId) {
            return {
              success: false,
              error: 'Se requiere productId para obtener información',
            };
          }
          return await this.toolGetProductInfo(
            companyId,
            params.productId as string,
          );

        case 'update_product_availability':
          if (!params?.productId || params?.available === undefined) {
            return {
              success: false,
              error:
                'Se requiere productId y available para actualizar disponibilidad',
            };
          }
          return await this.toolUpdateProductAvailability(
            companyId,
            params.productId as string,
            params.available as boolean,
          );

        case 'list_all_products':
          return await this.toolListAllProducts(companyId);

        default:
          return {
            success: false,
            error: `Herramienta desconocida: ${toolType}`,
          };
      }
    } catch (error) {
      this.logger.error(`Error ejecutando herramienta ${toolType}:`, error);
      return {
        success: false,
        error: `Error ejecutando la herramienta: ${error.message}`,
      };
    }
  }

  /**
   * Herramienta: Sincronizar inventario de Supabase hacia Meta
   */
  private async toolSyncInventoryToMeta(
    companyId: string,
  ): Promise<SalesToolResult> {
    const result = await this.metaCatalog.syncInventoryToMeta(companyId);

    if (!result) {
      return {
        success: false,
        error: 'No se pudo sincronizar el inventario con Meta',
      };
    }

    return {
      success: true,
      data: result,
      message: `Sincronización completada: ${result.synced} productos actualizados, ${result.errors} errores, ${result.warnings} advertencias`,
    };
  }

  /**
   * Herramienta: Sincronizar inventario de Meta hacia Supabase
   */
  private async toolSyncInventoryFromMeta(
    companyId: string,
  ): Promise<SalesToolResult> {
    const result = await this.metaCatalog.syncInventoryFromMeta(companyId);

    if (!result) {
      return {
        success: false,
        error: 'No se pudo sincronizar el inventario desde Meta',
      };
    }

    return {
      success: true,
      data: result,
      message: `Sincronización completada: ${result.synced} productos actualizados, ${result.errors} errores`,
    };
  }

  /**
   * Herramienta: Buscar productos en el catálogo de Meta
   */
  private async toolSearchProducts(
    companyId: string,
    searchTerm: string,
  ): Promise<SalesToolResult> {
    const catalogId = await this.metaCatalog.getCatalogId(companyId);
    if (!catalogId) {
      return {
        success: false,
        error: 'No se encontró el catalog_id para esta compañía',
      };
    }

    const result = await this.metaCatalog.searchProducts(catalogId, searchTerm);

    if (!result || !result.data) {
      return {
        success: false,
        error: 'No se encontraron productos',
      };
    }

    return {
      success: true,
      data: result.data,
      message: `Se encontraron ${result.data.length} productos`,
    };
  }

  /**
   * Herramienta: Obtener información de un producto específico
   */
  private async toolGetProductInfo(
    companyId: string,
    productId: string,
  ): Promise<SalesToolResult> {
    const catalogId = await this.metaCatalog.getCatalogId(companyId);
    if (!catalogId) {
      return {
        success: false,
        error: 'No se encontró el catalog_id para esta compañía',
      };
    }

    const result = await this.metaCatalog.getProductInfo(catalogId, productId);

    if (!result || !result.data || result.data.length === 0) {
      return {
        success: false,
        error: 'Producto no encontrado',
      };
    }

    return {
      success: true,
      data: result.data[0],
      message: 'Información del producto obtenida',
    };
  }

  /**
   * Herramienta: Actualizar disponibilidad de un producto
   */
  private async toolUpdateProductAvailability(
    companyId: string,
    productId: string,
    available: boolean,
  ): Promise<SalesToolResult> {
    const catalogId = await this.metaCatalog.getCatalogId(companyId);
    if (!catalogId) {
      return {
        success: false,
        error: 'No se encontró el catalog_id para esta compañía',
      };
    }

    const batchRequest: MetaBatchRequest = {
      method: 'UPDATE',
      retailer_id: productId,
      data: {
        id: productId,
        availability: available ? 'in stock' : 'out of stock',
      } as any,
    };

    const result = await this.metaCatalog.batchUpdateProducts(catalogId, [
      batchRequest,
    ]);

    if (!result) {
      return {
        success: false,
        error: 'No se pudo actualizar la disponibilidad del producto',
      };
    }

    const hasErrors =
      result.validation_status[0]?.errors &&
      result.validation_status[0].errors.length > 0;

    if (hasErrors) {
      return {
        success: false,
        error:
          result.validation_status[0]?.errors
            ?.map((e) => e.message)
            .join(', ') || 'Error desconocido',
      };
    }

    return {
      success: true,
      data: result,
      message: `Producto ${productId} actualizado a ${available ? 'disponible' : 'no disponible'}`,
    };
  }

  /**
   * Herramienta: Listar todos los productos del catálogo
   */
  private async toolListAllProducts(
    companyId: string,
  ): Promise<SalesToolResult> {
    const catalogId = await this.metaCatalog.getCatalogId(companyId);
    if (!catalogId) {
      return {
        success: false,
        error: 'No se encontró el catalog_id para esta compañía',
      };
    }

    const result = await this.metaCatalog.listCatalogProducts(catalogId);

    if (!result || !result.data) {
      return {
        success: false,
        error: 'No se pudieron listar los productos',
      };
    }

    return {
      success: true,
      data: result.data,
      message: `Se encontraron ${result.data.length} productos en el catálogo`,
    };
  }

  /**
   * Método auxiliar para que el LLM/Agent decida qué herramienta usar
   * basado en el contexto de la conversación
   */
  async detectAndExecuteTool(
    context: RouterMessageContext,
    sanitized: SanitizedTextResult,
  ): Promise<AgentResponse | null> {
    if (!this.geminiService.isEnabled()) {
      return null;
    }

    try {
      const model = this.geminiService.getModel();
      if (!model) {
        return null;
      }

      const instruction = `Eres un asistente de ventas. Analiza la intención del usuario y decide si necesita usar alguna herramienta del catálogo.

Herramientas disponibles:
- sync_inventory_to_meta: Sincroniza productos de la base de datos hacia Meta
- sync_inventory_from_meta: Sincroniza productos de Meta hacia la base de datos
- search_products: Busca productos por nombre (requiere: searchTerm)
- get_product_info: Obtiene info de un producto (requiere: productId)
- update_product_availability: Actualiza disponibilidad (requiere: productId, available)
- list_all_products: Lista todos los productos del catálogo

Mensaje del usuario: "${sanitized.normalizedText}"

Si el usuario pide buscar, actualizar, listar productos o sincronizar inventario, responde con:
{
  "tool": "nombre_herramienta",
  "params": {"searchTerm": "...", "productId": "...", "available": true/false}
}

Si NO se requiere herramienta, responde: {"tool": "none"}`;

      const result = await this.geminiService.generateText(instruction);

      const content = result?.trim() || '';

      // Intentar parsear la respuesta JSON
      let parsedResponse: any;
      try {
        // Extraer JSON si está envuelto en backticks
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[0]);
        } else {
          parsedResponse = JSON.parse(content);
        }
      } catch {
        return null;
      }

      if (parsedResponse.tool === 'none') {
        return null;
      }

      // Ejecutar la herramienta
      const toolResult = await this.executeCatalogTool(
        parsedResponse.tool as SalesToolType,
        context.tenant.companyId,
        parsedResponse.params || {},
      );

      // Generar respuesta natural basada en el resultado
      const responseText = await this.generateToolResponseText(
        context,
        parsedResponse.tool,
        toolResult,
      );

      return {
        actions: [
          {
            type: 'text',
            text: responseText,
          },
        ],
      };
    } catch (error) {
      this.logger.error('Error detectando/ejecutando herramienta:', error);
      return null;
    }
  }

  /**
   * Genera una respuesta natural basada en el resultado de una herramienta
   */
  private async generateToolResponseText(
    context: RouterMessageContext,
    toolName: string,
    result: SalesToolResult,
  ): Promise<string> {
    if (!result.success) {
      return `❌ ${result.error || 'Hubo un problema al ejecutar la acción'}`;
    }

    if (!this.geminiService.isEnabled()) {
      return `✅ ${result.message || 'Operación completada'}`;
    }

    try {
      const model = this.geminiService.getModel();
      if (!model) {
        return `✅ ${result.message || 'Operación completada'}`;
      }

      const config = context.tenant.companyConfig;
      const profile = config?.profile || {};
      const tone = profile.tone || 'amigable y profesional';

      const instruction = `Eres un asistente de ventas con tono ${tone}.

La herramienta "${toolName}" se ejecutó exitosamente.
Resultado: ${JSON.stringify(result, null, 2)}

Genera una respuesta breve (máximo 2 líneas) en español explicando al usuario qué se hizo.`;

      const response = await this.geminiService.generateText(instruction);

      return response || `✅ ${result.message}`;
    } catch (error) {
      this.logger.error('Error generando respuesta de herramienta:', error);
      return `✅ ${result.message}`;
    }
  }
}
