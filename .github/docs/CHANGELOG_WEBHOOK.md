# Changelog - WhatsApp Messages Webhook

## [2.0.0] - 2025-10-30

### ✨ Nuevas Características

#### 📋 Interfaces y DTOs Actualizados

- **WhatsAppContact**: Agregado campo `identity_key_hash` opcional
- **WhatsAppIncomingMessage**: 
  - Agregado campo `context` para mensajes desde productos o respuestas
  - Agregado campo `referral` para mensajes desde anuncios de clic a WhatsApp
  - Agregado campo `errors` para mensajes no soportados
  - Soporte para tipos adicionales: `button`, `sticker`, `reaction`, `order`, `system`, `unsupported`

#### 🆕 Nuevos DTOs

- `WhatsAppContextDto`: Información de contexto de mensajes
- `WhatsAppReferredProductDto`: Información de productos referenciados
- `WhatsAppReferralDto`: Información de anuncios de clic a WhatsApp
- `WhatsAppReferralWelcomeMessageDto`: Mensaje de bienvenida de anuncios
- `WhatsAppMessageErrorDto`: Errores en mensajes no soportados
- `WhatsAppErrorDataDto`: Detalles adicionales de errores

#### 🔧 Nuevos Handlers en WhatsappService

1. **handleMediaMessage(message, mediaType)**
   - Maneja imágenes, videos, audios y documentos
   - Logging detallado de información del medio
   - Respuesta automática de confirmación

2. **handleLocationMessage(message)**
   - Procesa mensajes de ubicación
   - Extrae coordenadas, nombre y dirección
   - Respuesta de confirmación

3. **handleInteractiveMessage(message)**
   - Maneja botones presionados (button_reply)
   - Maneja opciones de lista (list_reply)
   - Respuestas personalizadas según selección

4. **handleButtonMessage(message)**
   - Procesa mensajes de tipo button
   - Respuesta de confirmación

#### 🔍 Mejoras en handleTextMessage

- Detección automática de mensajes desde anuncios (referral)
- Respuestas personalizadas para mensajes desde productos (context)
- Mensajes contextuales según el origen del mensaje

#### 📊 Logging Mejorado

- Log automático de información de `context` cuando está presente
- Log de detalles de `referral` para mensajes desde anuncios
- Log de productos referenciados con catalog_id y product_retailer_id
- Log detallado de errores en mensajes no soportados

### 🔄 Cambios Significativos

#### En handleMessage()

```typescript
// ANTES
switch (message.type) {
  case 'text':
    await this.handleTextMessage(message);
    break;
  case 'image':
    this.logger.log('Imagen recibida:', message.image);
    break;
  // ...
}

// DESPUÉS
// Log de context y referral antes de procesar
if (message.context) {
  this.logger.log(`Mensaje con contexto...`);
}
if (message.referral) {
  this.logger.log(`Mensaje desde anuncio...`);
}

switch (message.type) {
  case 'text':
    await this.handleTextMessage(message);
    break;
  case 'image':
    await this.handleMediaMessage(message, 'image');
    break;
  // ... más tipos soportados
  case 'unsupported':
    // Manejo de errores
    break;
}
```

### 📝 Documentación

- **WEBHOOK_MESSAGES_UPDATES.md**: Guía completa de las nuevas funcionalidades
- **CHANGELOG_WEBHOOK.md**: Este archivo con el historial de cambios

### 🧪 Validación

- ✅ Compilación exitosa de TypeScript
- ✅ Validaciones de class-validator implementadas
- ✅ Documentación Swagger/OpenAPI actualizada
- ✅ Sin errores de linting

### 📚 Casos de Uso Soportados

1. **Mensajes de Texto Simple**
   - Usuario envía mensaje de texto directo
   - Respuesta automática según contenido

2. **Mensajes desde Botón "Message Business"**
   - Usuario toca botón en catálogo o producto
   - Se detecta el producto referenciado
   - Respuesta personalizada con información del producto

3. **Mensajes desde Anuncios de Clic a WhatsApp**
   - Usuario toca anuncio de Facebook/Instagram
   - Se captura información del anuncio
   - Tracking de CTWA Click ID
   - Respuesta personalizada según el anuncio

4. **Mensajes con Medios**
   - Imágenes, videos, audios, documentos
   - Logging de metadatos
   - Opción de descargar medios

5. **Mensajes Interactivos**
   - Respuestas a botones
   - Selecciones de listas
   - Confirmación de selección

6. **Mensajes de Ubicación**
   - Coordenadas GPS
   - Nombre del lugar
   - Dirección

7. **Mensajes No Soportados**
   - Detección automática
   - Logging de errores
   - Información para debugging

### 🔗 Referencias de la API Oficial

- [Messages Webhook Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/messages)
- [Text Messages Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/messages/text)
- [Webhooks Guide](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks)

### 🚀 Próximos Pasos Recomendados

1. Implementar persistencia de conversaciones en base de datos
2. Crear sistema de analytics para tracking de anuncios
3. Integrar con catálogo de productos para respuestas automáticas
4. Implementar sistema de carritos de compra
5. Agregar más tipos de mensajes interactivos (listas, botones)
6. Implementar webhooks para otros tipos (status, errors, etc.)

### 👥 Mantenedores

- Implementación basada en documentación oficial de WhatsApp Cloud API
- Fecha de implementación: 30 de octubre de 2025
