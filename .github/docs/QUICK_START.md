# 🚀 Guía Rápida de Inicio

## Configuración Inicial

### 1. Variables de Entorno
Crea o actualiza tu archivo `.env`:

```bash
PORT=3000
WHATSAPP_API_VERSION=v21.0
WHATSAPP_PHONE_NUMBER_ID=tu_phone_number_id_aqui
WHATSAPP_API_TOKEN=tu_token_aqui
WHATSAPP_VERIFY_TOKEN=tu_verify_token_aqui
ADMIN_PHONE_NUMBER=5215550000000
PAYMENT_BASE_URL=http://payment-backend-service
PAYMENT_API_KEY=opcional_api_key
GOOGLE_OAUTH_CLIENT_ID=tu_client_id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=tu_client_secret
GOOGLE_OAUTH_REDIRECT_URI=https://tu-dominio.com/auth/google/callback
GOOGLE_OAUTH_SCOPES=https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/calendar.events
GOOGLE_OAUTH_ENCRYPTION_KEY=clave_unica_para_tokens
SUPABASE_DB_URL=postgresql://USER:PASSWORD@db.supabase.co:6543/postgres?pgbouncer=true&sslmode=require
SUPABASE_DB_POOL_SIZE=5
# Opcionales para desarrollo sin DB
DEFAULT_COMPANY_ID=00000000-0000-0000-0000-000000000000
DEFAULT_COMPANY_NAME=Optus Sandbox
DEFAULT_COMPANY_CONFIG='{"company_tone":"Neutro","inventory_context":"General"}'
```

> ℹ️ **Nota:** Usa siempre el puerto 6543 del Supavisor de Supabase + `pgbouncer=true` para no agotar conexiones cuando llegan múltiples webhooks.

### 2. Instalar Dependencias (si no lo has hecho)
```bash
npm install
```

### 3. Compilar el Proyecto
```bash
npm run build
```

### 4. Iniciar el Servidor
```bash
# Desarrollo
npm run start:dev

# Producción
npm run start:prod
```

---

## 🧪 Prueba Rápida en 5 Minutos

### Paso 1: Verificar que el servidor esté corriendo
```bash
curl http://localhost:3000
```

### Paso 2: Probar la verificación del webhook
```bash
curl -X GET "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=tu_verify_token_aqui&hub.challenge=test123"
```
✅ **Resultado esperado:** `test123`

### Paso 3: Intento Booking (Router → Appointment Agent)
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
          "profile": {"name": "Test User"},
          "wa_id": "5215551234567"
        }],
        "messages": [{
          "from": "5215551234567",
          "id": "wamid.booking123",
          "timestamp": "1749416383",
          "type": "text",
          "text": {"body": "Necesito agendar una cita mañana 10:30"}
        }]
      },
      "field": "messages"
    }]
  }]
}'
```
✅ **Resultado esperado:** `{"status":"success"}` y en los logs verás `Intent INTENT_BOOKING` resuelto por el agente de citas.

### Paso 4: Intento Shopping + solicitud de QR
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
          "profile": {"name": "Test User"},
          "wa_id": "5215551234567"
        }],
        "messages": [{
          "from": "5215551234567",
          "id": "wamid.sales123",
          "timestamp": "1749416383",
          "type": "text",
          "text": {"body": "Quiero pagar 1250 mxn"}
        }]
      },
      "field": "messages"
    }]
  }]
}'
```
✅ **Resultado esperado:** `{"status":"success"}` y el log `Generando tu código QR con el banco...`.

### Paso 5: Simular evento del microservicio de pagos
```bash
curl -X POST http://localhost:3000/webhook/payments/result \
  -H "Content-Type: application/json" \
  -d '{
  "event_type": "QR_GENERATED",
  "order_id": "<pega_el_id_del_log>",
  "qr_image_base64": "TU_QR_BASE64"
}'
```
✅ **Resultado esperado:** `{"status":"received"}` y el servicio enviará automáticamente la imagen/QR al número que originó la orden.

---

## 📋 Checklist de Verificación

Marca cada item a medida que lo pruebes:

- [ ] ✅ Servidor iniciado correctamente
- [ ] ✅ Endpoint de verificación funcionando (GET /webhook)
- [ ] ✅ Intent booking enruta al agente de citas
- [ ] ✅ Intent shopping genera solicitud de QR
- [ ] ✅ Webhook de pagos recibe evento QR_GENERATED
- [ ] ✅ Logs muestran roles, intents y estado de pago
- [ ] ✅ Sin errores en la consola

---

## 📊 ¿Qué Ver en los Logs?

### Para intento booking:
```
[WhatsappService] Mensaje recibido de: 5215551234567
[WhatsappService] Tipo de mensaje: text
[AgentRouterService] Intent INTENT_BOOKING atendido...
[AppointmentAgentService] Solicitud de cita para  ...
```

### Para intento shopping:
```
[SalesAgentService] Estado actual STATE_CART para 5215551234567
[SalesAgentService] Generando tu código QR con el banco...
```

### Para webhook de pagos:
```
[PaymentWebhookController] Pago webhook: QR_GENERATED para <order>
[WhatsappService] Mensaje ... marcado como leído
```

---

## 🔧 Solución de Problemas Comunes

### Error: "Verificación fallida"
**Problema:** El token de verificación no coincide  
**Solución:** Verifica que `WHATSAPP_VERIFY_TOKEN` en `.env` sea correcto

### Error: "Cannot find module"
**Problema:** Dependencias no instaladas  
**Solución:** Ejecuta `npm install`

### Error: "Port already in use"
**Problema:** El puerto 3000 ya está en uso  
**Solución:** Cambia el puerto en `src/main.ts` o mata el proceso que lo usa

### No veo logs detallados
**Problema:** Nivel de logging bajo  
**Solución:** Los logs de WhatsApp usan `Logger` de NestJS, asegúrate de que esté habilitado

---

## 🎯 Siguientes Pasos

Una vez que hayas verificado que todo funciona:

1. **Conecta con WhatsApp Cloud API:**
   - Configura tu aplicación en Meta for Developers
   - Obtén tus credenciales reales
   - Actualiza las variables de entorno

2. **Configura el webhook en Meta:**
   - URL: `https://tu-dominio.com/webhook`
   - Verify Token: El mismo de tu `.env`
   - Campos a suscribir: `messages`

3. **Implementa lógica de negocio:**
   - Modifica los handlers según tus necesidades
   - Integra con tu base de datos
   - Agrega respuestas personalizadas

4. **Testing en producción:**
   - Usa los ejemplos de `TESTING_EXAMPLES.md`
   - Monitorea los logs
   - Ajusta según sea necesario

---

## 📚 Documentación Adicional

- **WEBHOOK_MESSAGES_UPDATES.md** - Guía completa de funcionalidades
- **WEBHOOK_STRUCTURE.md** - Estructura y diagramas
- **TESTING_EXAMPLES.md** - Ejemplos exhaustivos de testing
- **CHANGELOG_WEBHOOK.md** - Historial de cambios
- **IMPLEMENTATION_SUMMARY.md** - Resumen completo de la implementación

---

## 🆘 ¿Necesitas Ayuda?

### Recursos Oficiales
- [WhatsApp Cloud API Docs](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Webhooks Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/messages)

### Debug
Si algo no funciona:
1. Revisa los logs de la aplicación
2. Verifica las variables de entorno
3. Comprueba que el formato del webhook sea correcto
4. Usa los ejemplos de `TESTING_EXAMPLES.md`

---

## ✅ Todo Listo!

Si todos los pasos anteriores funcionaron correctamente, tu implementación está lista para:
- ✅ Recibir mensajes de WhatsApp
- ✅ Procesar mensajes con context (productos)
- ✅ Procesar mensajes con referral (anuncios)
- ✅ Manejar todos los tipos de mensajes
- ✅ Responder automáticamente

**¡Felicidades! 🎉**
