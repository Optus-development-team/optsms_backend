# WhatsApp Webhook Backend - NestJS

Backend configurado para actuar como webhook de WhatsApp Business API, permitiendo recibir y enviar mensajes.

## 🚀 Características

- ✅ Verificación y normalización de webhook (formato test/producción).
- ✅ Router con intents (`booking`, `shopping`, `reporting`, `2FA`).
- ✅ Resolución de roles por `ADMIN_PHONE_NUMBER` + sanitización PII.
- ✅ State machine de pagos + webhook `POST /webhook/payments/result`.
- ✅ Subida de QR en base64 al Graph API.
- ✅ Manejo de estados del mensaje (sent/delivered/read) y marcado automático.

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

# Número admin para RBAC
ADMIN_PHONE_NUMBER=5215550000000

# Integración con microservicio de pagos
PAYMENT_BASE_URL=http://payment-backend-service
PAYMENT_API_KEY=opcional_clave

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

### 3. Webhook de pagos (POST)
`POST /webhook/payments/result`

Eventos soportados: `QR_GENERATED`, `VERIFICATION_RESULT`, `LOGIN_2FA_REQUIRED`. Ver ejemplos en `QUICK_START.md`.

## 🔍 Estructura del proyecto

```
src/
├── whatsapp/
│   ├── agents/                      # Citas, ventas, reportes
│   ├── dto/                         # Webhook oficial + pagos
│   ├── interfaces/                  # Tipos WhatsApp Cloud API
│   ├── services/                    # Router, identidad, pago, sanitizado
│   ├── payment-webhook.controller.ts
│   ├── whatsapp.controller.ts
│   ├── whatsapp.service.ts
│   ├── whatsapp.types.ts
│   └── whatsapp.module.ts
├── app.module.ts
└── main.ts
```

## 💡 Personalización

### Modificar respuestas automáticas

- Ajusta keywords/intents en `AgentRouterService`.
- Personaliza los mensajes en cada agente (`src/whatsapp/agents/*.service.ts`).
- Añade nuevos estados al `SalesAgentService` si tu pasarela lo requiere.

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
