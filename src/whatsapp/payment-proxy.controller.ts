import { Controller, Get, Headers, HttpException, HttpStatus, Logger, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { SalesAgentService } from './agents/sales-agent.service';
import { WhatsappService } from './whatsapp.service';
import type { PaymentWebhookAction } from './dto/payment-webhook.dto';

interface XPaymentPayload {
  orderId?: string;
  details?: string;
}

@ApiTags('Payment Proxy')
@Controller('api')
export class PaymentProxyController {
  private readonly logger = new Logger(PaymentProxyController.name);
  private readonly paymentBackendUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly salesAgentService: SalesAgentService,
    private readonly whatsappService: WhatsappService,
  ) {
    this.paymentBackendUrl = this.configService.get<string>(
      'PAYMENT_BACKEND_URL',
      'http://localhost:3001',
    );
  }

  @Get('pay')
  @ApiOperation({
    summary: 'Proxy para reenviar X-PAYMENT al backend de pagos (main page)',
  })
  async forwardPayRequest(
    @Headers('x-payment') xPaymentHeader: string | undefined,
    @Query() query: Record<string, string | string[]>,
  ): Promise<any> {
    const targetUrl = this.buildTargetUrl(query);
    const headers: Record<string, string> = {};

    if (xPaymentHeader) {
      headers['X-PAYMENT'] = xPaymentHeader;
    }

    this.logger.debug(`Reenviando GET ${targetUrl} hacia backend de pagos`);

    try {
      const response = await firstValueFrom(
        this.httpService.get(targetUrl, {
          headers,
          validateStatus: () => true,
        }),
      );

      if (response.status === HttpStatus.OK && xPaymentHeader) {
        await this.handleSuccessfulPayment(xPaymentHeader);
      }

      if (response.status === HttpStatus.OK) {
        return response.data;
      }

      throw new HttpException(response.data, response.status);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const err = error as Error & { response?: { data?: unknown; status?: number } };
      const status = err.response?.status ?? HttpStatus.BAD_GATEWAY;
      const body = err.response?.data ?? err.message;
      this.logger.error('Error reenviando petición a backend de pagos', err);
      throw new HttpException(body, status);
    }
  }

  private buildTargetUrl(query: Record<string, string | string[]>): string {
    const params = new URLSearchParams();

    Object.entries(query).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          params.append(key, entry);
        });
      } else if (value !== undefined) {
        params.append(key, value);
      }
    });

    const queryString = params.toString();
    const base = `${this.paymentBackendUrl}/api/pay`;
    return queryString ? `${base}?${queryString}` : base;
  }

  private async handleSuccessfulPayment(header: string): Promise<void> {
    const payload = this.decodeXPayment(header);
    if (!payload?.orderId) {
      this.logger.warn('X-PAYMENT recibido sin orderId. No se actualizará ninguna orden.');
      return;
    }

    const actions = await this.salesAgentService.confirmOrderFromProxy(
      payload.orderId,
      payload.details,
    );

    if (!actions.length) {
      return;
    }

    await this.dispatchActions(actions);
  }

  private decodeXPayment(header: string): XPaymentPayload | null {
    try {
      const raw = Buffer.from(header, 'base64').toString('utf8');
      return JSON.parse(raw) as XPaymentPayload;
    } catch (error) {
      this.logger.error('No se pudo decodificar el header X-PAYMENT', error as Error);
      return null;
    }
  }

  private async dispatchActions(actions: PaymentWebhookAction[]): Promise<void> {
    for (const action of actions) {
      if (action.type === 'text' && action.text) {
        await this.whatsappService.sendTextMessage(action.to, action.text, {
          companyId: action.companyId,
        });
      } else if (action.type === 'image' && action.imageBase64) {
        await this.whatsappService.sendImageFromBase64(
          action.to,
          action.imageBase64,
          action.mimeType,
          action.caption,
          { companyId: action.companyId },
        );
      }
    }
  }
}
