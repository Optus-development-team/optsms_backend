# Estructura del Webhook de WhatsApp Messages

## Diagrama de Flujo

```
WhatsApp Cloud API
     │  (POST /webhook)
     ▼
┌──────────────────────────────┐
│ WhatsappController          │
│ • Normaliza payload (prod/test)
│ • Responde { status: success }
└──────────────┬───────────────┘
      │
      ▼
┌──────────────────────────────┐
│ WhatsappService              │
│ • markAsRead                 │
│ • Deriva textos al Router    │
│ • Envía acciones (text/QR)   │
└──────────────┬───────────────┘
      │ RouterMessageContext
      ▼
┌──────────────────────────────┐
│ SanitizationService          │
│  Replace PII → tokens        │
└──────────────┬───────────────┘
      ▼
┌──────────────────────────────┐
│ IdentityService              │
│  ROLE_CLIENT / ROLE_ADMIN    │
└──────────────┬───────────────┘
      ▼
┌──────────────────────────────┐
│ AgentRouterService           │
│  - detectIntent()            │
│  - valida permisos           │
│  - delega al agente          │
└─────┬───────────┬────────────┘
   │           │
   │           │
 ┌──────────┐ ┌───────────────┐
 │Agente    │ │Sales Agent    │
 │Citas     │ │(Payments)     │
 │Calendario│ │State machine  │
 └──────────┘ └─────┬─────────┘
   │              │
 ┌──────────┐   ┌────▼────────────────────────────┐
 │Reporting │   │PaymentClientService             │
 │Agent     │   │• POST /generate-qr              │
 └──────────┘   │• POST /verify-payment           │
       │• POST /set-2fa                  │
       └─────┬───────────────────────────┘
          │
          ▼
       ┌──────────────────────┐
       │Webhook Pagos         │
       │POST /webhook/...     │
       │→ SalesAgent → WhatsApp│
       └──────────────────────┘
```

## Estructura del Payload

### Mensaje Entrante (Incoming Message)

```typescript
{
  object: "whatsapp_business_account",
  entry: [{
    id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
    changes: [{
      value: {
        messaging_product: "whatsapp",
        metadata: {
          display_phone_number: "...",
          phone_number_id: "..."
        },
        contacts: [{
          profile: { name: "..." },
          wa_id: "...",
          identity_key_hash?: "..."  // ← NUEVO
        }],
        messages: [{
          from: "...",
          id: "...",
          timestamp: "...",
          type: "text|image|video|...",
          
          // Campos según tipo
          text?: { body: "..." },
          image?: { id: "...", mime_type: "...", ... },
          
          // ← NUEVO: Context
          context?: {
            from: "...",
            id: "...",
            referred_product?: {
              catalog_id: "...",
              product_retailer_id: "..."
            }
          },
          
          // ← NUEVO: Referral
          referral?: {
            source_url: "...",
            source_type: "ad|post",
            headline: "...",
            body: "...",
            ctwa_clid?: "...",
            ...
          },
          
          // ← NUEVO: Errors
          errors?: [{
            code: 131051,
            title: "...",
            message: "..."
          }]
        }]
      },
      field: "messages"
    }]
  }]
}
```

## Tipos de Mensaje Soportados

| Tipo | Handler | Descripción |
|------|---------|-------------|
| `text` | `handleTextMessage()` | Mensajes de texto simple |
| `image` | `handleMediaMessage()` | Imágenes |
| `video` | `handleMediaMessage()` | Videos |
| `audio` | `handleMediaMessage()` | Audios / Notas de voz |
| `document` | `handleMediaMessage()` | Documentos (PDF, etc.) |
| `location` | `handleLocationMessage()` | Ubicaciones GPS |
| `interactive` | `handleInteractiveMessage()` | Botones y listas |
| `button` | `handleButtonMessage()` | Botones presionados |
| `contacts` | *(Log only)* | Contactos compartidos |
| `sticker` | *(Log only)* | Stickers |
| `reaction` | *(Log only)* | Reacciones (👍, ❤️, etc.) |
| `order` | *(Log only)* | Órdenes de compra |
| `system` | *(Log only)* | Mensajes del sistema |
| `unsupported` | *(Log errors)* | Tipos no soportados |

## Campos Opcionales Especiales

### Context (Contexto)

**Cuándo está presente:**
- Usuario usa botón "Message business" en catálogo/producto
- Mensaje es respuesta a otro mensaje
- Mensaje es reenviado

**Casos de uso:**
- Detectar consultas sobre productos específicos
- Mantener contexto de conversación
- Identificar origen del mensaje

### Referral (Referencias de Anuncios)

**Cuándo está presente:**
- Usuario toca anuncio de clic a WhatsApp en Facebook/Instagram
- Usuario responde a anuncio desde Stories

**Casos de uso:**
- Tracking de efectividad de anuncios
- Personalizar respuesta según anuncio
- Analytics de marketing
- ROI de campañas publicitarias

### Identity Key Hash

**Cuándo está presente:**
- Verificación de cambio de identidad está habilitada
- WhatsApp detecta cambio en clave de identidad del usuario

**Casos de uso:**
- Seguridad adicional
- Detectar cambios de dispositivo
- Prevención de suplantación

## Flujo de Respuesta Automática

```
Texto recibido
  │
  ▼
Sanitización PII → Tokens
  │
  ▼
Resolución de Rol (admin/cliente)
  │
  ▼
Detección de intent
│  • cita/agenda → Appointment Agent
│  • pagar/qr/orden → Sales Agent
│  • reporte/kpi → Reporting Agent (solo admin)
│  • token/2fa → Sales Agent Sec (solo admin)
│  • sin intent → fallback educativo
  │
  ▼
Agente genera RouterActions (textos, imágenes)
  │
  ▼
WhatsappService envía mensajes → WhatsApp Cloud API
```

## Respuestas del Sistema

### Mensajes de Texto (Router)

| Intent | Respuesta inicial |
|--------|------------------|
| `INTENT_BOOKING` | "Agente de Citas en línea ✅ Verificando disponibilidad local..." |
| `INTENT_SHOPPING` | "Estoy cuidando tu carrito. Escribe *Pagar* para generar el QR..." |
| `INTENT_REPORTING` | "Reporte ejecutivo listo 📊..." (solo admin) |
| `INTENT_2FA_REPLY` | "Necesito el código numérico..." (solo admin) |
| Fallback | "No identifiqué la intención. Usa palabras como *cita*, *pagar*, *reporte* o *token*." |

### Mensajes con Media

Confirmación: "Hemos recibido tu [tipo]. Gracias por compartirlo."

### Ubicaciones

Confirmación: "Hemos recibido tu ubicación. Un agente la revisará pronto."

### Interactivos

Confirmación: "Has seleccionado: [opción]"

## Estados de Mensaje Saliente

```
Mensaje enviado
      │
      ▼
┌──────────┐
│  sent    │  →  Enviado al servidor de WhatsApp
└────┬─────┘
     │
     ▼
┌──────────┐
│delivered │  →  Entregado al dispositivo del usuario
└────┬─────┘
     │
     ▼
┌──────────┐
│   read   │  →  Usuario leyó el mensaje
└──────────┘
```

Cada estado genera un webhook separado con el array `statuses[]`.

## Seguridad

1. **Verificación del Webhook**
   - Método GET con hub.verify_token
   - Validado en `verifyWebhook()`

2. **Validación de Payload**
   - DTOs con class-validator
   - Verificación de object type
   - Type safety con TypeScript

3. **Manejo de Errores**
   - Try-catch en todos los handlers
   - Logging detallado de errores
   - Respuesta exitosa para no perder mensajes

## Variables de Entorno Requeridas

```env
WHATSAPP_API_VERSION=v21.0
WHATSAPP_PHONE_NUMBER_ID=tu_phone_number_id
WHATSAPP_API_TOKEN=tu_api_token
WHATSAPP_VERIFY_TOKEN=tu_verify_token
ADMIN_PHONE_NUMBER=5215550000000
PAYMENT_BASE_URL=http://payment-backend-service
PAYMENT_API_KEY=tu_api_key_interna
```

## Testing

### Verificación del Webhook
```bash
curl -X GET "https://tu-servidor.com/webhook?hub.mode=subscribe&hub.verify_token=tu_token&hub.challenge=12345"
```

### Enviar Mensaje de Prueba
```bash
curl -X POST https://tu-servidor.com/webhook/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5215551234567",
    "message": "Hola desde la API"
  }'
```

## Monitoring y Logs

El sistema registra:
- ✅ Mensajes recibidos (tipo, origen)
- ✅ Context cuando está presente
- ✅ Referral cuando está presente
- ✅ Productos referenciados
- ✅ Estados de mensajes salientes
- ✅ Errores de procesamiento
- ✅ Mensajes no soportados
