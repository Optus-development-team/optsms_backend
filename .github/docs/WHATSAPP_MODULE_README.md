# 📱 Módulo WhatsApp - API de Mensajes

## Descripción

Implementación completa del webhook de messages de WhatsApp Cloud API v21.0 para NestJS, siguiendo la documentación oficial de Meta/Facebook.

---

## ✨ Características

### 🔥 Principales
- ✅ **Webhook completo** para mensajes entrantes y salientes
- ✅ **Context detection** - Detecta mensajes desde productos y catálogos
- ✅ **Referral tracking** - Tracking completo de anuncios de clic a WhatsApp
- ✅ **14 tipos de mensajes** soportados
- ✅ **Handlers específicos** para cada tipo de mensaje
- ✅ **Respuestas automáticas** personalizables
- ✅ **Logging detallado** de todas las interacciones

### 🛡️ Seguridad y Validación
- ✅ Verificación de webhook con token
- ✅ Validación de payload con DTOs (class-validator)
- ✅ TypeScript estricto
- ✅ Documentación Swagger/OpenAPI completa

### 📊 Tipos de Mensaje Soportados

| Tipo | Handler | Descripción |
|------|---------|-------------|
| `text` | ✅ Completo | Mensajes de texto con detección de context y referral |
| `image` | ✅ Completo | Imágenes con caption y metadata |
| `video` | ✅ Completo | Videos con caption y metadata |
| `audio` | ✅ Completo | Audios y notas de voz |
| `document` | ✅ Completo | Documentos (PDF, etc.) |
| `location` | ✅ Completo | Ubicaciones GPS |
| `interactive` | ✅ Completo | Botones y listas interactivas |
| `button` | ✅ Completo | Botones presionados |
| `contacts` | ℹ️ Log | Contactos compartidos |
| `sticker` | ℹ️ Log | Stickers |
| `reaction` | ℹ️ Log | Reacciones (emoji) |
| `order` | ℹ️ Log | Órdenes de compra |
| `system` | ℹ️ Log | Mensajes del sistema |
| `unsupported` | ⚠️ Error | Tipos no soportados con logging de errores |

---

## 🚀 Inicio Rápido

### 1. Configuración

**Variables de entorno (.env):**
```env
WHATSAPP_API_VERSION=v21.0
WHATSAPP_PHONE_NUMBER_ID=tu_phone_number_id
WHATSAPP_API_TOKEN=tu_api_token
WHATSAPP_VERIFY_TOKEN=tu_verify_token
```

### 2. Verificar Webhook

```bash
curl -X GET "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=tu_verify_token&hub.challenge=test"
```

### 3. Enviar Mensaje de Prueba

```bash
curl -X POST http://localhost:3000/webhook/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5215551234567",
    "message": "Hola desde la API"
  }'
```

---

## 📖 Documentación

### Guías Principales
- **[QUICK_START.md](./QUICK_START.md)** - Guía rápida de inicio en 5 minutos
- **[WEBHOOK_MESSAGES_UPDATES.md](./WEBHOOK_MESSAGES_UPDATES.md)** - Funcionalidades y ejemplos
- **[WEBHOOK_STRUCTURE.md](./WEBHOOK_STRUCTURE.md)** - Estructura detallada y diagramas
- **[TESTING_EXAMPLES.md](./TESTING_EXAMPLES.md)** - Ejemplos exhaustivos de testing

### Referencias
- **[CHANGELOG_WEBHOOK.md](./CHANGELOG_WEBHOOK.md)** - Historial de cambios
- **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** - Resumen de implementación

---

## 🎯 Casos de Uso

### 1. Mensaje de Texto Simple
```typescript
// Recibido automáticamente desde WhatsApp
{
  "type": "text",
  "text": {
    "body": "Hola, necesito ayuda"
  }
}

// Respuesta automática del bot
"¡Hola! 👋 Bienvenido a nuestro servicio de WhatsApp."
```

### 2. Mensaje desde Producto (Context)
```typescript
// Usuario toca "Message business" en un producto
{
  "type": "text",
  "text": {
    "body": "¿Está disponible este producto?"
  },
  "context": {
    "from": "15550783881",
    "id": "wamid.xxx",
    "referred_product": {
      "catalog_id": "194836987003835",
      "product_retailer_id": "PROD_001"
    }
  }
}

// Respuesta personalizada
"Gracias por tu interés en nuestro producto PROD_001. Un agente te ayudará..."
```

### 3. Mensaje desde Anuncio (Referral)
```typescript
// Usuario toca anuncio de Facebook/Instagram
{
  "type": "text",
  "text": {
    "body": "Quiero más información"
  },
  "referral": {
    "source_url": "https://fb.me/xxx",
    "source_type": "ad",
    "headline": "Ofertas Especiales",
    "body": "¡50% de descuento!",
    "ctwa_clid": "xxx" // Para tracking
  }
}

// Respuesta personalizada con info del anuncio
"¡Hola! Gracias por contactarnos desde nuestro anuncio 'Ofertas Especiales'..."
```

---

## 🔧 API Endpoints

### GET /webhook
**Verificación del webhook por Meta**

**Query params:**
- `hub.mode`: "subscribe"
- `hub.verify_token`: Token de verificación
- `hub.challenge`: Challenge string

**Respuesta:** Challenge string si el token es válido

---

### POST /webhook
**Recepción de mensajes de WhatsApp**

**Body:** WhatsAppWebhookDto (estructura oficial de Meta)

**Respuesta:** `{ "status": "success" }`

---

### POST /webhook/send
**Envío de mensaje de texto**

**Body:**
```json
{
  "to": "5215551234567",
  "message": "Hola, ¿cómo estás?"
}
```

**Respuesta:** Respuesta de WhatsApp Cloud API

---

### POST /webhook/send-image
**Envío de imagen**

**Body:**
```json
{
  "to": "5215551234567",
  "imageUrl": "https://ejemplo.com/imagen.jpg",
  "caption": "Mira esta imagen"
}
```

---

### POST /webhook/send-template
**Envío de plantilla**

**Body:**
```json
{
  "to": "5215551234567",
  "templateName": "hello_world",
  "languageCode": "es",
  "components": []
}
```

---

## 🧪 Testing

### Testing Manual con cURL
Ver ejemplos completos en [TESTING_EXAMPLES.md](./TESTING_EXAMPLES.md)

### Testing con Postman
Importa la colección incluida en la documentación

### Testing Automatizado
```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Coverage
npm run test:cov
```

---

## 📊 Estructura del Código

```
src/whatsapp/
├── dto/
│   ├── send-image-message.dto.ts
│   ├── send-template-message.dto.ts
│   ├── send-text-message.dto.ts
│   └── whatsapp-webhook.dto.ts         ← DTOs completos del webhook
├── interfaces/
│   └── whatsapp.interface.ts           ← Interfaces TypeScript
├── whatsapp.controller.ts              ← Endpoints del webhook
├── whatsapp.service.ts                 ← Lógica de negocio y handlers
└── whatsapp.module.ts                  ← Módulo NestJS
```

---

## 🎨 Personalización

### Modificar Respuestas Automáticas

**Archivo:** `src/whatsapp/whatsapp.service.ts`

```typescript
private async handleTextMessage(
  message: WhatsAppIncomingMessage,
): Promise<void> {
  // Tu lógica personalizada aquí
  
  if (message.referral) {
    // Lógica para mensajes desde anuncios
  }
  
  if (message.context?.referred_product) {
    // Lógica para mensajes desde productos
  }
  
  // Respuestas personalizadas según keywords
  const text = message.text.body.toLowerCase();
  if (text.includes('precio')) {
    // Responder con información de precios
  }
}
```

### Agregar Nuevos Handlers

```typescript
private async handleNuevoTipo(
  message: WhatsAppIncomingMessage,
): Promise<void> {
  // Tu implementación
}

// Agregar al switch en handleMessage()
case 'nuevo_tipo':
  await this.handleNuevoTipo(message);
  break;
```

---

## 📈 Monitoring y Logs

### Logs Automáticos
El sistema registra automáticamente:
- ✅ Tipo de mensaje recibido
- ✅ Información de context (si presente)
- ✅ Información de referral (si presente)
- ✅ Productos referenciados
- ✅ Estados de mensajes
- ✅ Errores y mensajes no soportados

### Ejemplo de Log
```
[WhatsappService] Mensaje recibido de: 5215551234567
[WhatsappService] Tipo de mensaje: text
[WhatsappService] Mensaje desde anuncio - Tipo: ad, URL: https://fb.me/xxx
[WhatsappService] Headline: Ofertas Especiales
[WhatsappService] CTWA Click ID: xxx
[WhatsappService] Texto: Quiero más información
```

---

## 🚨 Solución de Problemas

### Error: Verificación fallida
**Causa:** Token de verificación incorrecto  
**Solución:** Verifica `WHATSAPP_VERIFY_TOKEN` en `.env`

### No se reciben mensajes
**Causa:** Webhook no configurado en Meta  
**Solución:** Configura el webhook en Meta for Developers

### Errores de validación
**Causa:** Estructura del payload incorrecta  
**Solución:** Verifica que el payload coincida con los DTOs

---

## 📚 Referencias Oficiales

- [WhatsApp Cloud API Documentation](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Messages Webhook Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/messages)
- [Text Messages Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/messages/text)
- [Webhooks Setup Guide](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks)

---

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:
1. Sigue la estructura de código existente
2. Agrega tests para nuevas funcionalidades
3. Actualiza la documentación
4. Asegúrate de que `npm run lint` pase sin errores

---

## 📝 Licencia

Este módulo está licenciado bajo [MIT License](../LICENSE)

---

## 👨‍💻 Soporte

Para soporte técnico:
1. Revisa la documentación en los archivos MD
2. Consulta los ejemplos de testing
3. Verifica los logs de la aplicación
4. Consulta la documentación oficial de WhatsApp

---

## ✨ Características Destacadas

- 🎯 **100% compatible** con WhatsApp Cloud API v21.0
- 🔒 **Seguro** con validación completa
- 📝 **Bien documentado** con Swagger y archivos MD
- 🧪 **Testeable** con ejemplos exhaustivos
- 🚀 **Producción ready** sin errores de compilación
- 💪 **TypeScript** estricto y tipado completo

---

**Versión:** 2.0.0  
**Última actualización:** 30 de octubre de 2025  
**Compatible con:** WhatsApp Cloud API v21.0

---

¡Listo para recibir y procesar mensajes de WhatsApp! 🎉
