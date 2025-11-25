# Actualizaciones del Webhook de WhatsApp Messages

## Resumen de Cambios

Se han implementado modificaciones completas al webhook de messages de WhatsApp siguiendo la documentación oficial de Meta/Facebook:
- [Messages Webhook Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/messages)
- [Text Messages Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/messages/text)

## Nuevas Funcionalidades Implementadas

### 1. Soporte para Context (Contexto de Mensaje)

Los mensajes ahora pueden incluir un campo `context` que indica:
- **Mensajes desde botón "Message business"**: Cuando un usuario usa el botón para contactar desde un catálogo o producto
- **Respuestas y reenvíos**: Cuando un mensaje es una respuesta a otro mensaje

**Estructura:**
```typescript
context?: {
  from: string;                    // Número de teléfono desde donde se originó
  id: string;                      // ID del mensaje original
  referred_product?: {             // Solo si viene desde un producto
    catalog_id: string;            // ID del catálogo
    product_retailer_id: string;   // ID del producto
  };
}
```

**Ejemplo de uso:**
```typescript
if (message.context?.referred_product) {
  console.log(`Consulta sobre producto: ${message.context.referred_product.product_retailer_id}`);
}
```

### 2. Soporte para Referral (Anuncios de Clic a WhatsApp)

Los mensajes provenientes de anuncios de Facebook/Instagram ahora incluyen el campo `referral` con información del anuncio:

**Estructura:**
```typescript
referral?: {
  source_url: string;              // URL del anuncio
  source_id: string;               // ID de la fuente
  source_type: 'ad' | 'post';      // Tipo de fuente
  headline: string;                // Título del anuncio
  body: string;                    // Cuerpo del anuncio
  media_type: 'image' | 'video';   // Tipo de medio
  image_url?: string;              // URL de la imagen (si aplica)
  video_url?: string;              // URL del video (si aplica)
  thumbnail_url?: string;          // URL del thumbnail
  ctwa_clid?: string;              // Click-to-WhatsApp Ad ID (se omite en anuncios de estado)
  welcome_message?: {              // Mensaje de bienvenida del anuncio
    text: string;
  };
}
```

**Ejemplo de uso:**
```typescript
if (message.referral) {
  console.log(`Mensaje desde anuncio: ${message.referral.headline}`);
  console.log(`CTWA Click ID: ${message.referral.ctwa_clid}`);
}
```

### 3. Identity Key Hash en Contactos

Los contactos ahora pueden incluir `identity_key_hash` cuando la verificación de cambio de identidad está habilitada:

```typescript
contacts?: [{
  profile: { name: string };
  wa_id: string;
  identity_key_hash?: string;  // Nueva propiedad
}]
```

### 4. Soporte para Tipos de Mensaje Adicionales

Se agregaron los siguientes tipos de mensaje:
- `button`: Mensajes con botones presionados
- `sticker`: Stickers
- `reaction`: Reacciones a mensajes
- `order`: Órdenes de compra
- `system`: Mensajes del sistema
- `unsupported`: Mensajes de tipos no soportados

### 5. Manejo de Errores en Mensajes No Soportados

Los mensajes de tipo `unsupported` ahora incluyen información detallada de errores:

```typescript
errors?: Array<{
  code: number;
  title: string;
  message?: string;
  error_data?: {
    details: string;
  };
}>
```

## Handlers Implementados

### 1. `handleTextMessage(message)`
Maneja mensajes de texto con lógica especial para:
- Mensajes provenientes de anuncios (referral)
- Mensajes provenientes de productos (context)
- Respuestas automáticas básicas

### 2. `handleMediaMessage(message, mediaType)`
Maneja medios de tipo:
- `image`: Imágenes
- `video`: Videos
- `audio`: Audio
- `document`: Documentos

### 3. `handleLocationMessage(message)`
Procesa mensajes de ubicación con coordenadas, nombre y dirección.

### 4. `handleInteractiveMessage(message)`
Maneja respuestas interactivas:
- `button_reply`: Botones presionados
- `list_reply`: Opciones de lista seleccionadas

### 5. `handleButtonMessage(message)`
Procesa mensajes de tipo botón.

## Logging Mejorado

El servicio ahora registra automáticamente:
- Información de context cuando está presente
- Detalles de referral cuando el mensaje viene de un anuncio
- Productos referenciados
- Errores detallados en mensajes no soportados

## Ejemplos de Webhooks

### Mensaje de Texto Simple
```json
{
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
          "profile": { "name": "Juan Pérez" },
          "wa_id": "16505551234"
        }],
        "messages": [{
          "from": "16505551234",
          "id": "wamid.HBgM...",
          "timestamp": "1749416383",
          "type": "text",
          "text": {
            "body": "Hola, ¿tienen disponibilidad?"
          }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### Mensaje desde Botón "Message Business"
```json
{
  "messages": [{
    "context": {
      "from": "15550783881",
      "id": "wamid.HBgM...",
      "referred_product": {
        "catalog_id": "194836987003835",
        "product_retailer_id": "di9ozbzfi4"
      }
    },
    "from": "16505551234",
    "id": "wamid.HBgM...",
    "timestamp": "1750016800",
    "text": {
      "body": "¿Sigue disponible este producto?"
    },
    "type": "text"
  }]
}
```

### Mensaje desde Anuncio de Clic a WhatsApp
```json
{
  "messages": [{
    "referral": {
      "source_url": "https://fb.me/3cr4Wqqkv",
      "source_id": "120226305854810726",
      "source_type": "ad",
      "body": "¡Suculentas de verano disponibles!",
      "headline": "Chatea con nosotros",
      "media_type": "image",
      "image_url": "https://scontent.xx.fbcdn.net/v/t45.1...",
      "ctwa_clid": "Aff-n8ZT...",
      "welcome_message": {
        "text": "¡Hola! ¿En qué podemos ayudarte?"
      }
    },
    "from": "16505551234",
    "id": "wamid.HBgM...",
    "timestamp": "1750275992",
    "text": {
      "body": "¿Puedo obtener más información?"
    },
    "type": "text"
  }]
}
```

## Validación de Datos

Todos los DTOs incluyen validación completa con:
- `class-validator` para validación de tipos y formatos
- `class-transformer` para transformación automática
- Documentación Swagger/OpenAPI completa

## Recomendaciones de Uso

1. **Tracking de Anuncios**: Usa el campo `referral.ctwa_clid` para hacer seguimiento de qué anuncios generan más conversaciones.

2. **Productos**: Cuando recibas un `context.referred_product`, puedes cargar automáticamente información del producto para responder mejor.

3. **Mensajes de Bienvenida**: Los mensajes con `referral.welcome_message` pueden aprovecharse para personalizar respuestas iniciales.

4. **Errores**: Monitorea los mensajes de tipo `unsupported` para identificar funcionalidades que podrías necesitar implementar.

## Próximos Pasos Sugeridos

1. Implementar lógica de negocio específica en cada handler
2. Integrar con base de datos para almacenar historial de conversaciones
3. Crear respuestas automáticas personalizadas según el tipo de mensaje
4. Implementar analytics para tracking de anuncios y productos
5. Agregar manejo de carritos de compra para mensajes de tipo `order`

## Referencias

- [WhatsApp Cloud API - Messages Webhook](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/messages)
- [WhatsApp Cloud API - Text Messages](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/messages/text)
- [WhatsApp Cloud API - Guide](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks)
