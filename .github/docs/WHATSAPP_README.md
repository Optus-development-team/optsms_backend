# WhatsApp Webhook Backend - NestJS

Backend configurado para actuar como webhook de WhatsApp Business API, permitiendo recibir y enviar mensajes.

## 🚀 Características

- ✅ Verificación de webhook de WhatsApp
- ✅ Recepción de mensajes entrantes
- ✅ Envío de mensajes de texto
- ✅ Envío de imágenes, videos, documentos
- ✅ Respuestas automáticas
- ✅ Manejo de estados de mensajes (enviado, entregado, leído)
- ✅ Marcado automático de mensajes como leídos
- ✅ Soporte para plantillas de WhatsApp
- ✅ Descarga de medios

## 📋 Requisitos previos

1. **Cuenta de WhatsApp Business API**
   - Crear una app en [Meta for Developers](https://developers.facebook.com/)
   - Configurar WhatsApp Business API
   - Obtener el Phone Number ID
   - Generar un token de acceso permanente

2. **ngrok o servicio similar** (para desarrollo local)
   ```bash
   npm install -g ngrok
   ```

## 🛠️ Instalación

1. Clonar el repositorio e instalar dependencias:
```bash
npm install
```

2. Configurar las variables de entorno:
```bash
cp .env.example .env
```

3. Editar el archivo `.env` con tus credenciales:
```env
# Token de verificación (puedes poner cualquier cadena aleatoria)
WHATSAPP_VERIFY_TOKEN=mi_token_secreto_123

# Token de la API de WhatsApp (desde Meta for Developers)
WHATSAPP_API_TOKEN=tu_token_permanente_aqui

# ID del número de teléfono (desde Meta for Developers)
WHATSAPP_PHONE_NUMBER_ID=123456789012345

# Versión de la API
WHATSAPP_API_VERSION=v21.0

# Puerto de la aplicación
PORT=3000
```

## 🔧 Configuración de WhatsApp Business API

### 1. Crear una app en Meta for Developers

1. Ve a https://developers.facebook.com/
2. Crea una nueva app
3. Selecciona "Business" como tipo
4. Agrega el producto "WhatsApp"

### 2. Obtener credenciales

1. **Phone Number ID**: En la consola de WhatsApp, encontrarás el ID del número de teléfono
2. **Access Token**: 
   - Inicialmente tendrás un token temporal (24 horas)
   - Para producción, genera un token permanente desde "System Users"

### 3. Configurar el Webhook

1. Exponer tu servidor local con ngrok:
```bash
ngrok http 3000
```

2. Copiar la URL generada (ej: `https://abc123.ngrok-free.app`)

3. En la consola de Meta for Developers:
   - Ve a WhatsApp > Configuration
   - Click en "Edit" en "Webhook"
   - **Callback URL**: `https://abc123.ngrok-free.app/webhook`
   - **Verify Token**: El mismo que pusiste en `WHATSAPP_VERIFY_TOKEN`
   - Click en "Verify and Save"

4. Suscribirse a los eventos:
   - Marca: `messages`, `message_status`

## 🚀 Ejecución

### Modo desarrollo
```bash
npm run start:dev
```

### Modo producción
```bash
npm run build
npm run start:prod
```

## 📡 Endpoints disponibles

### 1. Verificación del Webhook (GET)
```
GET /webhook?hub.mode=subscribe&hub.verify_token=tu_token&hub.challenge=123
```
Este endpoint es llamado automáticamente por WhatsApp para verificar tu webhook.

### 2. Recepción de mensajes (POST)
```
POST /webhook
```
WhatsApp enviará automáticamente los mensajes a este endpoint.

### 3. Enviar mensaje de texto (POST)
```bash
curl -X POST http://localhost:3000/webhook/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "34600123456",
    "message": "¡Hola desde mi backend!"
  }'
```

### 4. Enviar imagen (POST)
```bash
curl -X POST http://localhost:3000/webhook/send-image \
  -H "Content-Type: application/json" \
  -d '{
    "to": "34600123456",
    "imageUrl": "https://example.com/imagen.jpg",
    "caption": "Mira esta imagen"
  }'
```

### 5. Enviar plantilla (POST)
```bash
curl -X POST http://localhost:3000/webhook/send-template \
  -H "Content-Type: application/json" \
  -d '{
    "to": "34600123456",
    "templateName": "hello_world",
    "languageCode": "es"
  }'
```

## 🔍 Estructura del proyecto

```
src/
├── whatsapp/
│   ├── interfaces/
│   │   └── whatsapp.interface.ts    # Interfaces de TypeScript
│   ├── whatsapp.controller.ts       # Controlador de endpoints
│   ├── whatsapp.service.ts          # Lógica de negocio
│   └── whatsapp.module.ts           # Módulo de WhatsApp
├── app.module.ts                    # Módulo principal
└── main.ts                          # Punto de entrada
```

## 💡 Personalización

### Modificar respuestas automáticas

Edita el método `handleTextMessage` en `src/whatsapp/whatsapp.service.ts`:

```typescript
private async handleTextMessage(message: WhatsAppIncomingMessage): Promise<void> {
  const messageText = message.text.body.toLowerCase();

  // Agrega tus propias respuestas
  if (messageText.includes('precio')) {
    await this.sendTextMessage(
      message.from,
      'Nuestros precios empiezan desde €10/mes',
    );
  }
  // ... más lógica personalizada
}
```

### Agregar nuevos tipos de mensajes

El servicio ya incluye métodos para:
- `sendTextMessage(to, text)`
- `sendImageMessage(to, imageUrl, caption)`
- `sendVideoMessage(to, videoUrl, caption)`
- `sendDocumentMessage(to, documentUrl, filename, caption)`
- `sendTemplateMessage(to, templateName, languageCode, components)`

## 📝 Formato de números de teléfono

Los números deben estar en formato internacional sin `+`:
- ✅ Correcto: `34600123456`
- ❌ Incorrecto: `+34600123456` o `600123456`

## 🐛 Solución de problemas

### El webhook no se verifica
- Asegúrate de que el `WHATSAPP_VERIFY_TOKEN` en `.env` coincide con el configurado en Meta
- Verifica que ngrok esté corriendo y la URL sea accesible
- Revisa los logs del servidor

### No llegan los mensajes
- Verifica que estés suscrito a los eventos `messages` en la configuración del webhook
- Asegúrate de que el token de API sea válido y tenga permisos
- Revisa los logs del servidor para ver si hay errores

### Error al enviar mensajes
- Verifica que el `WHATSAPP_API_TOKEN` sea válido
- Asegúrate de que el `WHATSAPP_PHONE_NUMBER_ID` sea correcto
- El número debe estar en formato internacional sin `+`

## 📚 Recursos adicionales

- [Documentación oficial de WhatsApp Business API](https://developers.facebook.com/docs/whatsapp)
- [Cloud API Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/reference)
- [Webhooks Guide](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks)

## 🔒 Seguridad

En producción:
1. No compartas tu token de API
2. Usa HTTPS para el webhook
3. Valida las peticiones entrantes
4. Implementa rate limiting
5. Usa variables de entorno seguras

## 📄 Licencia

Este proyecto es de código abierto.
