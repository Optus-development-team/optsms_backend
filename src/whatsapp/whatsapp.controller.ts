import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { WhatsappService } from './whatsapp.service';
import { SendImageMessageDto } from './dto/send-image-message.dto';
import { SendTemplateMessageDto } from './dto/send-template-message.dto';
import { SendTextMessageDto } from './dto/send-text-message.dto';
import type { WhatsAppMessage } from './interfaces/whatsapp.interface';

@ApiTags('WhatsApp Webhook')
@Controller('webhook')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(private readonly whatsappService: WhatsappService) {}

  /**
   * GET /webhook - Verificación del webhook por parte de WhatsApp
   * Este endpoint es llamado por WhatsApp para verificar tu webhook
   */
  @Get()
  @ApiOperation({
    summary: 'Verifica la suscripción del webhook con Meta',
    description:
      'Meta ejecuta este endpoint para confirmar que el webhook es válido. Debe devolver el challenge recibido cuando el token coincide.',
  })
  @ApiQuery({ name: 'hub.mode', required: true, example: 'subscribe' })
  @ApiQuery({ name: 'hub.verify_token', required: true })
  @ApiQuery({ name: 'hub.challenge', required: true })
  @ApiOkResponse({
    description: 'Challenge devuelto exitosamente',
    schema: { type: 'string' },
  })
  @ApiBadRequestResponse({ description: 'Verificación fallida' })
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    this.logger.log('Verificación de webhook solicitada');

    const result = this.whatsappService.verifyWebhook(mode, token, challenge);

    if (!result) {
      throw new BadRequestException('Verificación fallida');
    }

    return result;
  }

  /**
   * POST /webhook - Recepción de mensajes de WhatsApp
   * Este endpoint es llamado por WhatsApp cuando llega un mensaje
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recibe eventos entrantes de WhatsApp' })
  @ApiOkResponse({
    description: 'Evento procesado correctamente',
    schema: { example: { status: 'success' } },
  })
  async receiveWebhook(
    @Body() body: Record<string, unknown>,
  ): Promise<{ status: string }> {
    this.logger.log('Webhook recibido');
    this.logger.debug('Body completo:', JSON.stringify(body, null, 2));

    try {
      // Detectar si es el formato de prueba de Meta (sin wrapper object/entry)
      // o el formato real de producción
      let normalizedBody: WhatsAppMessage;

      if ('object' in body && 'entry' in body) {
        // Formato real de producción
        this.logger.log('Formato de producción detectado');
        normalizedBody = body as unknown as WhatsAppMessage;
      } else if ('field' in body && 'value' in body) {
        // Formato de prueba de Meta - necesita normalización
        this.logger.log(
          'Formato de prueba de Meta detectado - normalizando...',
        );
        const testBody = body as {
          field: string;
          value: Record<string, unknown>;
        };
        const metadata = testBody.value.metadata as
          | Record<string, unknown>
          | undefined;
        const phoneNumberId = metadata?.phone_number_id;
        normalizedBody = {
          object: 'whatsapp_business_account',
          entry: [
            {
              id: typeof phoneNumberId === 'string' ? phoneNumberId : 'test_id',
              changes: [
                {
                  field: testBody.field,
                  value:
                    testBody.value as unknown as WhatsAppMessage['entry'][0]['changes'][0]['value'],
                },
              ],
            },
          ],
        };
        this.logger.debug(
          'Payload normalizado:',
          JSON.stringify(normalizedBody, null, 2),
        );
      } else {
        this.logger.error('Formato de payload no reconocido');
        this.logger.error('Body recibido:', JSON.stringify(body, null, 2));
        throw new BadRequestException('Formato de payload no válido');
      }

      await this.whatsappService.processIncomingMessage(normalizedBody);
      return { status: 'success' };
    } catch (error) {
      const safeError = error as Error & { stack?: string };
      this.logger.error('Error procesando webhook:', safeError.message);
      this.logger.error('Stack trace:', safeError.stack);
      this.logger.error('Body recibido:', JSON.stringify(body, null, 2));
      // Respondemos con éxito aunque haya errores para no perder mensajes
      return { status: 'error' };
    }
  }

  /**
   * POST /webhook/send - Endpoint para enviar mensajes manualmente
   * Este es un endpoint adicional para que puedas enviar mensajes desde tu aplicación
   */
  @Post('send')
  @ApiOperation({ summary: 'Envía un mensaje de texto' })
  @ApiBody({ type: SendTextMessageDto })
  @ApiOkResponse({ description: 'Respuesta de la API de WhatsApp' })
  async sendMessage(@Body() body: SendTextMessageDto): Promise<any> {
    this.logger.log(`Enviando mensaje a ${body.to}`);
    return this.whatsappService.sendTextMessage(body.to, body.message);
  }

  /**
   * POST /webhook/send-image - Endpoint para enviar imágenes
   */
  @Post('send-image')
  @ApiOperation({ summary: 'Envía una imagen a través de WhatsApp' })
  @ApiBody({ type: SendImageMessageDto })
  @ApiOkResponse({ description: 'Respuesta de la API de WhatsApp' })
  async sendImage(@Body() body: SendImageMessageDto): Promise<any> {
    this.logger.log(`Enviando imagen a ${body.to}`);
    return this.whatsappService.sendImageMessage(
      body.to,
      body.imageUrl,
      body.caption,
    );
  }

  /**
   * POST /webhook/send-template - Endpoint para enviar mensajes con plantilla
   */
  @Post('send-template')
  @ApiOperation({ summary: 'Envía un mensaje basado en plantilla aprobada' })
  @ApiBody({ type: SendTemplateMessageDto })
  @ApiOkResponse({ description: 'Respuesta de la API de WhatsApp' })
  async sendTemplate(@Body() body: SendTemplateMessageDto): Promise<any> {
    this.logger.log(`Enviando plantilla ${body.templateName} a ${body.to}`);
    return this.whatsappService.sendTemplateMessage(
      body.to,
      body.templateName,
      body.languageCode,
      body.components,
    );
  }
}
