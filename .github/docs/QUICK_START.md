# 🚀 Guía Rápida de Inicio

## Configuración Inicial

### 1. Variables de Entorno
Crea o actualiza tu archivo `.env`:

```bash
WHATSAPP_API_VERSION=v21.0
WHATSAPP_PHONE_NUMBER_ID=tu_phone_number_id_aqui
WHATSAPP_API_TOKEN=tu_token_aqui
WHATSAPP_VERIFY_TOKEN=tu_verify_token_aqui
```

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

### Paso 3: Enviar un mensaje de texto simple
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
          "id": "wamid.test123",
          "timestamp": "1749416383",
          "type": "text",
          "text": {"body": "Hola"}
        }]
      },
      "field": "messages"
    }]
  }]
}'
```
✅ **Resultado esperado:** `{"status":"success"}`

### Paso 4: Probar mensaje con Context (desde producto)
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
          "id": "wamid.test456",
          "timestamp": "1749416383",
          "type": "text",
          "text": {"body": "¿Está disponible?"},
          "context": {
            "from": "15550783881",
            "id": "wamid.context123",
            "referred_product": {
              "catalog_id": "123456",
              "product_retailer_id": "PROD_001"
            }
          }
        }]
      },
      "field": "messages"
    }]
  }]
}'
```
✅ **Resultado esperado:** `{"status":"success"}`

**Verifica los logs:** Deberías ver información del producto referenciado

### Paso 5: Probar mensaje con Referral (desde anuncio)
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
          "id": "wamid.test789",
          "timestamp": "1749416383",
          "type": "text",
          "text": {"body": "Quiero más información"},
          "referral": {
            "source_url": "https://fb.me/test123",
            "source_id": "120226305854810726",
            "source_type": "ad",
            "headline": "Ofertas Especiales",
            "body": "¡50% de descuento!",
            "media_type": "image",
            "ctwa_clid": "test_click_id_12345"
          }
        }]
      },
      "field": "messages"
    }]
  }]
}'
```
✅ **Resultado esperado:** `{"status":"success"}`

**Verifica los logs:** Deberías ver información del anuncio

---

## 📋 Checklist de Verificación

Marca cada item a medida que lo pruebes:

- [ ] ✅ Servidor iniciado correctamente
- [ ] ✅ Endpoint de verificación funcionando (GET /webhook)
- [ ] ✅ Mensaje de texto simple procesado
- [ ] ✅ Mensaje con context procesado
- [ ] ✅ Mensaje con referral procesado
- [ ] ✅ Logs mostrando información correcta
- [ ] ✅ Sin errores en la consola

---

## 📊 ¿Qué Ver en los Logs?

### Para mensaje simple:
```
[WhatsappService] Mensaje recibido de: 5215551234567
[WhatsappService] Tipo de mensaje: text
[WhatsappService] Texto: Hola
[WhatsappService] Mensaje wamid.test123 marcado como leído
```

### Para mensaje con context:
```
[WhatsappService] Mensaje recibido de: 5215551234567
[WhatsappService] Tipo de mensaje: text
[WhatsappService] Mensaje con contexto - Origen: 15550783881, ID: wamid.context123
[WhatsappService] Producto referenciado - Catálogo: 123456, Producto: PROD_001
[WhatsappService] Texto: ¿Está disponible?
```

### Para mensaje con referral:
```
[WhatsappService] Mensaje recibido de: 5215551234567
[WhatsappService] Tipo de mensaje: text
[WhatsappService] Mensaje desde anuncio - Tipo: ad, URL: https://fb.me/test123
[WhatsappService] Headline: Ofertas Especiales
[WhatsappService] Body: ¡50% de descuento!
[WhatsappService] CTWA Click ID: test_click_id_12345
[WhatsappService] Texto: Quiero más información
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
