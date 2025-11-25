# Ejemplos de Testing - Webhook de WhatsApp

## 1. Testing con cURL

### Verificación del Webhook (GET)
```bash
curl -X GET "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=tu_verify_token&hub.challenge=test_challenge"
# Respuesta esperada: test_challenge
```

### Mensaje de Texto Simple
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "102290129340398",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "15550783881",
          "phone_number_id": "106540352242922"
        },
        "contacts": [{
          "profile": {
            "name": "Juan Pérez"
          },
          "wa_id": "5215551234567"
        }],
        "messages": [{
          "from": "5215551234567",
          "id": "wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA=",
          "timestamp": "1749416383",
          "type": "text",
          "text": {
            "body": "Hola, buenos días"
          }
        }]
      },
      "field": "messages"
    }]
  }]
}'
```

### Mensaje desde Botón "Message Business" (con Context)
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "419561257915477",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "15550783881",
          "phone_number_id": "106540352242922"
        },
        "contacts": [{
          "profile": {
            "name": "María González"
          },
          "wa_id": "5215559876543"
        }],
        "messages": [{
          "context": {
            "from": "15550783881",
            "id": "wamid.HBgLMTY1MDM4Nzk0MzkVAgARGA9wcm9kdWN0X2lucXVpcnkA",
            "referred_product": {
              "catalog_id": "194836987003835",
              "product_retailer_id": "prod_123456"
            }
          },
          "from": "5215559876543",
          "id": "wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTA2NTUwRkNEMDdFQjJCRUU0NQA=",
          "timestamp": "1750016800",
          "text": {
            "body": "¿Sigue disponible este producto?"
          },
          "type": "text"
        }]
      },
      "field": "messages"
    }]
  }]
}'
```

### Mensaje desde Anuncio de Clic a WhatsApp (con Referral)
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "102290129340398",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "15550783881",
          "phone_number_id": "106540352242922"
        },
        "contacts": [{
          "profile": {
            "name": "Carlos Ramírez"
          },
          "wa_id": "5215551112233"
        }],
        "messages": [{
          "referral": {
            "source_url": "https://fb.me/3cr4Wqqkv",
            "source_id": "120226305854810726",
            "source_type": "ad",
            "body": "¡Ofertas de verano disponibles!",
            "headline": "Chatea con nosotros",
            "media_type": "image",
            "image_url": "https://scontent.xx.fbcdn.net/v/t45.1...",
            "ctwa_clid": "Aff-n8ZTODiE79d22KtAwQKj9e_mIEOOj27vDVwFjN80dp4",
            "welcome_message": {
              "text": "¡Hola! ¿En qué podemos ayudarte hoy?"
            }
          },
          "from": "5215551112233",
          "id": "wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQUQ0N0VFMDA2MTQ0RkJFNkNDNAA=",
          "timestamp": "1750275992",
          "text": {
            "body": "¿Puedo obtener más información?"
          },
          "type": "text"
        }]
      },
      "field": "messages"
    }]
  }]
}'
```

### Mensaje con Imagen
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "102290129340398",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "15550783881",
          "phone_number_id": "106540352242922"
        },
        "contacts": [{
          "profile": {
            "name": "Ana López"
          },
          "wa_id": "5215554445566"
        }],
        "messages": [{
          "from": "5215554445566",
          "id": "wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA=",
          "timestamp": "1749416383",
          "type": "image",
          "image": {
            "caption": "Mira este producto",
            "mime_type": "image/jpeg",
            "sha256": "a1b2c3d4e5f6",
            "id": "media_123456"
          }
        }]
      },
      "field": "messages"
    }]
  }]
}'
```

### Mensaje de Ubicación
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "102290129340398",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "15550783881",
          "phone_number_id": "106540352242922"
        },
        "contacts": [{
          "profile": {
            "name": "Pedro Sánchez"
          },
          "wa_id": "5215557778899"
        }],
        "messages": [{
          "from": "5215557778899",
          "id": "wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA=",
          "timestamp": "1749416383",
          "type": "location",
          "location": {
            "latitude": 19.432608,
            "longitude": -99.133209,
            "name": "Zócalo",
            "address": "Centro Histórico, Ciudad de México"
          }
        }]
      },
      "field": "messages"
    }]
  }]
}'
```

### Mensaje Interactivo (Botón)
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "102290129340398",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "15550783881",
          "phone_number_id": "106540352242922"
        },
        "contacts": [{
          "profile": {
            "name": "Luis Martínez"
          },
          "wa_id": "5215553334455"
        }],
        "messages": [{
          "from": "5215553334455",
          "id": "wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA=",
          "timestamp": "1749416383",
          "type": "interactive",
          "interactive": {
            "type": "button_reply",
            "button_reply": {
              "id": "btn_soporte",
              "title": "Soporte Técnico"
            }
          }
        }]
      },
      "field": "messages"
    }]
  }]
}'
```

### Mensaje No Soportado (con errores)
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "102290129340398",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "15550783881",
          "phone_number_id": "106540352242922"
        },
        "contacts": [{
          "profile": {
            "name": "Sofia Torres"
          },
          "wa_id": "5215556667788"
        }],
        "messages": [{
          "from": "5215556667788",
          "id": "wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA=",
          "timestamp": "1749416383",
          "type": "unsupported",
          "errors": [{
            "code": 131051,
            "title": "Unsupported message type",
            "message": "Este tipo de mensaje no está soportado actualmente",
            "error_data": {
              "details": "Message type is not currently supported"
            }
          }]
        }]
      },
      "field": "messages"
    }]
  }]
}'
```

## 2. Testing con Postman

### Collection JSON
Puedes importar esta colección en Postman:

```json
{
  "info": {
    "name": "WhatsApp Webhook Tests",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Verificar Webhook",
      "request": {
        "method": "GET",
        "header": [],
        "url": {
          "raw": "{{base_url}}/webhook?hub.mode=subscribe&hub.verify_token={{verify_token}}&hub.challenge=test123",
          "host": ["{{base_url}}"],
          "path": ["webhook"],
          "query": [
            {"key": "hub.mode", "value": "subscribe"},
            {"key": "hub.verify_token", "value": "{{verify_token}}"},
            {"key": "hub.challenge", "value": "test123"}
          ]
        }
      }
    },
    {
      "name": "Mensaje de Texto Simple",
      "request": {
        "method": "POST",
        "header": [{"key": "Content-Type", "value": "application/json"}],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"object\": \"whatsapp_business_account\",\n  \"entry\": [{\n    \"id\": \"102290129340398\",\n    \"changes\": [{\n      \"value\": {\n        \"messaging_product\": \"whatsapp\",\n        \"metadata\": {\n          \"display_phone_number\": \"15550783881\",\n          \"phone_number_id\": \"106540352242922\"\n        },\n        \"contacts\": [{\n          \"profile\": {\"name\": \"Test User\"},\n          \"wa_id\": \"5215551234567\"\n        }],\n        \"messages\": [{\n          \"from\": \"5215551234567\",\n          \"id\": \"wamid.test123\",\n          \"timestamp\": \"1749416383\",\n          \"type\": \"text\",\n          \"text\": {\"body\": \"Hola\"}\n        }]\n      },\n      \"field\": \"messages\"\n    }]\n  }]\n}"
        },
        "url": {
          "raw": "{{base_url}}/webhook",
          "host": ["{{base_url}}"],
          "path": ["webhook"]
        }
      }
    },
    {
      "name": "Mensaje con Context",
      "request": {
        "method": "POST",
        "header": [{"key": "Content-Type", "value": "application/json"}],
        "body": {
          "mode": "raw",
          "raw": "// Ver ejemplo de cURL arriba"
        },
        "url": {
          "raw": "{{base_url}}/webhook",
          "host": ["{{base_url}}"],
          "path": ["webhook"]
        }
      }
    }
  ],
  "variable": [
    {
      "key": "base_url",
      "value": "http://localhost:3000",
      "type": "string"
    },
    {
      "key": "verify_token",
      "value": "tu_verify_token",
      "type": "string"
    }
  ]
}
```

## 3. Testing con Jest

### test/whatsapp-webhook.e2e-spec.ts
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('WhatsApp Webhook (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /webhook (Verificación)', () => {
    it('debe verificar el webhook correctamente', () => {
      return request(app.getHttpServer())
        .get('/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': process.env.WHATSAPP_VERIFY_TOKEN,
          'hub.challenge': 'test_challenge',
        })
        .expect(200)
        .expect('test_challenge');
    });

    it('debe rechazar token incorrecto', () => {
      return request(app.getHttpServer())
        .get('/webhook')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'token_incorrecto',
          'hub.challenge': 'test_challenge',
        })
        .expect(400);
    });
  });

  describe('POST /webhook (Mensajes entrantes)', () => {
    it('debe procesar mensaje de texto simple', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          id: '102290129340398',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550783881',
                phone_number_id: '106540352242922',
              },
              contacts: [{
                profile: { name: 'Test User' },
                wa_id: '5215551234567',
              }],
              messages: [{
                from: '5215551234567',
                id: 'wamid.test123',
                timestamp: '1749416383',
                type: 'text',
                text: { body: 'Hola' },
              }],
            },
            field: 'messages',
          }],
        }],
      };

      return request(app.getHttpServer())
        .post('/webhook')
        .send(payload)
        .expect(200)
        .expect({ status: 'success' });
    });

    it('debe procesar mensaje con context', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          id: '102290129340398',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550783881',
                phone_number_id: '106540352242922',
              },
              contacts: [{
                profile: { name: 'Test User' },
                wa_id: '5215551234567',
              }],
              messages: [{
                from: '5215551234567',
                id: 'wamid.test123',
                timestamp: '1749416383',
                type: 'text',
                text: { body: '¿Está disponible?' },
                context: {
                  from: '15550783881',
                  id: 'wamid.context123',
                  referred_product: {
                    catalog_id: '123456',
                    product_retailer_id: 'prod_001',
                  },
                },
              }],
            },
            field: 'messages',
          }],
        }],
      };

      return request(app.getHttpServer())
        .post('/webhook')
        .send(payload)
        .expect(200)
        .expect({ status: 'success' });
    });

    it('debe procesar mensaje con referral', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [{
          id: '102290129340398',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550783881',
                phone_number_id: '106540352242922',
              },
              contacts: [{
                profile: { name: 'Test User' },
                wa_id: '5215551234567',
              }],
              messages: [{
                from: '5215551234567',
                id: 'wamid.test123',
                timestamp: '1749416383',
                type: 'text',
                text: { body: 'Más información' },
                referral: {
                  source_url: 'https://fb.me/test',
                  source_id: '123456',
                  source_type: 'ad',
                  headline: 'Ofertas especiales',
                  body: 'Descuentos del 50%',
                  media_type: 'image',
                  ctwa_clid: 'test_click_id',
                },
              }],
            },
            field: 'messages',
          }],
        }],
      };

      return request(app.getHttpServer())
        .post('/webhook')
        .send(payload)
        .expect(200)
        .expect({ status: 'success' });
    });
  });
});
```

## 4. Testing Unitario del Servicio

### src/whatsapp/whatsapp.service.spec.ts
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { WhatsappService } from './whatsapp.service';
import { of } from 'rxjs';

describe('WhatsappService', () => {
  let service: WhatsappService;
  let httpService: HttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue: any) => {
              const config = {
                WHATSAPP_API_VERSION: 'v21.0',
                WHATSAPP_PHONE_NUMBER_ID: 'test_phone_id',
                WHATSAPP_API_TOKEN: 'test_token',
                WHATSAPP_VERIFY_TOKEN: 'test_verify_token',
              };
              return config[key] || defaultValue;
            }),
          },
        },
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
    httpService = module.get<HttpService>(HttpService);
  });

  it('debe estar definido', () => {
    expect(service).toBeDefined();
  });

  describe('verifyWebhook', () => {
    it('debe verificar token correcto', () => {
      const result = service.verifyWebhook(
        'subscribe',
        'test_verify_token',
        'challenge123',
      );
      expect(result).toBe('challenge123');
    });

    it('debe rechazar token incorrecto', () => {
      const result = service.verifyWebhook(
        'subscribe',
        'wrong_token',
        'challenge123',
      );
      expect(result).toBeNull();
    });
  });

  describe('processIncomingMessage', () => {
    it('debe procesar mensaje con context', async () => {
      const mockMessage = {
        object: 'whatsapp_business_account',
        entry: [{
          id: '123',
          changes: [{
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '123',
                phone_number_id: '456',
              },
              messages: [{
                from: '5215551234567',
                id: 'msg123',
                timestamp: '1234567890',
                type: 'text',
                text: { body: 'Test' },
                context: {
                  from: '123',
                  id: 'ctx123',
                  referred_product: {
                    catalog_id: 'cat123',
                    product_retailer_id: 'prod123',
                  },
                },
              }],
            },
            field: 'messages',
          }],
        }],
      };

      jest.spyOn(httpService, 'post').mockReturnValue(
        of({ data: { success: true } } as any),
      );

      await service.processIncomingMessage(mockMessage as any);
      expect(httpService.post).toHaveBeenCalled();
    });
  });
});
```

## 5. Variables de Entorno para Testing

### .env.test
```env
WHATSAPP_API_VERSION=v21.0
WHATSAPP_PHONE_NUMBER_ID=test_phone_number_id
WHATSAPP_API_TOKEN=test_api_token
WHATSAPP_VERIFY_TOKEN=test_verify_token
```

## 6. Logs Esperados

### Mensaje Simple
```
[WhatsappService] Mensaje recibido de: 5215551234567
[WhatsappService] Tipo de mensaje: text
[WhatsappService] Texto: Hola
[WhatsappService] Mensaje wamid.test123 marcado como leído
[WhatsappService] Mensaje enviado correctamente a 5215551234567
```

### Mensaje con Context
```
[WhatsappService] Mensaje recibido de: 5215551234567
[WhatsappService] Tipo de mensaje: text
[WhatsappService] Mensaje con contexto - Origen: 15550783881, ID: wamid.context123
[WhatsappService] Producto referenciado - Catálogo: 123456, Producto: prod_001
[WhatsappService] Texto: ¿Está disponible?
```

### Mensaje con Referral
```
[WhatsappService] Mensaje recibido de: 5215551234567
[WhatsappService] Tipo de mensaje: text
[WhatsappService] Mensaje desde anuncio - Tipo: ad, URL: https://fb.me/test
[WhatsappService] Headline: Ofertas especiales
[WhatsappService] Body: Descuentos del 50%
[WhatsappService] CTWA Click ID: test_click_id
[WhatsappService] Texto: Más información
```

## 7. Checklist de Testing

- [ ] Verificación de webhook (GET)
- [ ] Mensaje de texto simple
- [ ] Mensaje con context (producto)
- [ ] Mensaje con referral (anuncio)
- [ ] Mensaje con imagen
- [ ] Mensaje con video
- [ ] Mensaje con audio
- [ ] Mensaje con documento
- [ ] Mensaje con ubicación
- [ ] Mensaje interactivo (botón)
- [ ] Mensaje interactivo (lista)
- [ ] Mensaje no soportado (unsupported)
- [ ] Estado de mensaje (delivered)
- [ ] Estado de mensaje (read)
- [ ] Envío de mensaje de texto
- [ ] Envío de imagen
- [ ] Envío de plantilla

## 8. Monitoring en Producción

### Métricas a Monitorear
- Mensajes recibidos por tipo
- Mensajes con context
- Mensajes con referral
- Errores de procesamiento
- Tiempo de respuesta
- Mensajes no soportados

### Herramientas Recomendadas
- **Logging**: Winston / Pino
- **Monitoring**: Prometheus + Grafana
- **Alertas**: PagerDuty / Opsgenie
- **APM**: New Relic / DataDog
