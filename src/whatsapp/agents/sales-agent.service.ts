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

    const amount = this.extractAmount(sanitized.normalizedText);
    if (amount && order.amount !== amount) {
      order.amount = amount;
      order.lastUpdate = new Date();
      await this.ensureOrderUser(order, context.role);
      order.supabaseOrderId = await this.ordersSyncService.syncDraft(order);
    }

    await this.ensureOrderUser(order, context.role);

    const wantsCheckout = /(pagar|checkout|qr|cobrar|generar)/.test(
      sanitized.normalizedText,
    );
    const confirmPaid = /(ya pague|ya pagué|listo|pagado|confirmo)/.test(
      sanitized.normalizedText,
    );
    const wantsStatus = /(estatus|estado|cómo va|como va)/.test(
      sanitized.normalizedText,
    );

    const actions: RouterAction[] = [];

    if (!order.amount) {
      actions.push({
        type: 'text',
        text: 'Para preparar tu orden necesito el monto total. Escribe por ejemplo: *Pagar 1500 MXN*.',
      });
      return { actions };
    }

    if (wantsCheckout && order.state === PaymentState.CART) {
      actions.push({
        type: 'text',
        text: 'Generando tu código QR con el banco...',
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

    if (confirmPaid && order.state === PaymentState.QR_SENT) {
      actions.push({
        type: 'text',
        text: 'Perfecto, pidiéndole al banco que confirme...',
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

    if (wantsStatus) {
      actions.push({
        type: 'text',
        text: `Estado actual de tu orden ${order.orderId}: ${order.state}. Te aviso apenas cambie.`,
      });
      return { actions };
    }

    return {
      actions: [
        {
          type: 'text',
          text: 'Estoy cuidando tu carrito. Escribe *Pagar* para generar el QR o indícame el monto si aún no lo has enviado.',
        },
      ],
    };
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
            to: order.clientPhone,
            type: 'text',
            text: '¡Tu QR está listo! Escanéalo desde tu app bancaria y confirma cuando hayas pagado.',
          },
          {
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
