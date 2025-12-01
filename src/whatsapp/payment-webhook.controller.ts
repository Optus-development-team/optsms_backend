import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { SalesAgentService } from './agents/sales-agent.service';
import { WhatsappService } from './whatsapp.service';

@ApiTags('Payment Webhook')
@Controller('webhook/payments')
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  constructor(
    private readonly salesAgentService: SalesAgentService,
    private readonly whatsappService: WhatsappService,
  ) {}

  @Post('result')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Recibe eventos del microservicio de pagos' })
  async handlePaymentEvent(
    @Body() payload: PaymentWebhookDto,
  ): Promise<{ status: string }> {
    this.logger.log(
      `Pago webhook: ${payload.event_type} para ${payload.order_id}`,
    );
    const actions = await this.salesAgentService.handlePaymentWebhook(payload);

    for (const action of actions) {
      if (action.type === 'text' && action.text) {
        await this.whatsappService.sendTextMessage(action.to, action.text);
      } else if (action.type === 'image' && action.imageBase64) {
        await this.whatsappService.sendImageFromBase64(
          action.to,
          action.imageBase64,
          action.mimeType,
          action.caption,
        );
      }
    }

    return { status: 'received' };
  }
}
