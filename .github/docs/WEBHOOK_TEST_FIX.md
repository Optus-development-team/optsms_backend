# 🐛 Fix: Error en Webhook con Payload de Prueba de Meta

## 📋 Problema Identificado

### Síntoma
Al probar el webhook desde la herramienta de prueba de webhooks de Meta/Facebook, se recibían errores de validación.

### Causa Raíz
**El payload de prueba de Meta tiene una estructura diferente al payload real de producción.**

#### Payload de Prueba de Meta (INCORRECTO para nuestro código original):
```json
{
  "field": "messages",
  "value": {
    "messaging_product": "whatsapp",
    "metadata": {
      "display_phone_number": "16505551111",
      "phone_number_id": "123456123"
    },
    "contacts": [...],
    "messages": [...]
  }
}
```

#### Payload Real de Producción (ESPERADO por nuestro código):
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "123456123",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {...},
        "contacts": [...],
        "messages": [...]
      }
    }]
  }]
}
```

### Diferencias Clave

| Característica | Payload de Prueba | Payload Real |
|----------------|-------------------|--------------|
| Wrapper `object` | ❌ No incluido | ✅ Incluido |
| Wrapper `entry` | ❌ No incluido | ✅ Incluido |
| Campo `field` | ✅ Nivel raíz | ✅ Dentro de `changes` |
| Campo `value` | ✅ Nivel raíz | ✅ Dentro de `changes` |

---

## ✅ Solución Implementada

### 1. Detección Automática de Formato

El controller ahora detecta automáticamente qué tipo de payload recibe:

```typescript
if ('object' in body && 'entry' in body) {
  // Formato real de producción
  normalizedBody = body as unknown as WhatsAppMessage;
} else if ('field' in body && 'value' in body) {
  // Formato de prueba de Meta - necesita normalización
  normalizedBody = normalizarPayloadDePrueba(body);
}
```

### 2. Normalización del Payload de Prueba

Cuando se detecta el formato de prueba, se convierte automáticamente al formato esperado:

```typescript
normalizedBody = {
  object: 'whatsapp_business_account',
  entry: [{
    id: phoneNumberId || 'test_id',
    changes: [{
      field: testBody.field,      // 'messages'
      value: testBody.value        // El objeto value completo
    }]
  }]
};
```

### 3. Logging Mejorado

Se agregó logging detallado para debugging:

```typescript
this.logger.log('Formato de prueba de Meta detectado - normalizando...');
this.logger.debug('Payload normalizado:', JSON.stringify(normalizedBody, null, 2));
```

---

## 🔧 Cambios en el Código

### Archivo: `src/whatsapp/whatsapp.controller.ts`

#### Antes:
```typescript
async receiveWebhook(
  @Body() body: WhatsAppWebhookDto,
): Promise<{ status: string }> {
  await this.whatsappService.processIncomingMessage(
    body as unknown as WhatsAppMessage,
  );
}
```

#### Después:
```typescript
async receiveWebhook(
  @Body() body: Record<string, unknown>,
): Promise<{ status: string }> {
  // Detectar formato y normalizar si es necesario
  let normalizedBody: WhatsAppMessage;
  
  if ('object' in body && 'entry' in body) {
    // Producción
    normalizedBody = body as unknown as WhatsAppMessage;
  } else if ('field' in body && 'value' in body) {
    // Prueba de Meta - normalizar
    normalizedBody = this.normalizeTestPayload(body);
  }
  
  await this.whatsappService.processIncomingMessage(normalizedBody);
}
```

---

## 🧪 Pruebas

### 1. Payload de Prueba de Meta
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
  "field": "messages",
  "value": {
    "messaging_product": "whatsapp",
    "metadata": {
      "display_phone_number": "16505551111",
      "phone_number_id": "123456123"
    },
    "contacts": [{
      "profile": {"name": "test user name"},
      "wa_id": "16315551181"
    }],
    "messages": [{
      "from": "16315551181",
      "id": "ABGGFlA5Fpa",
      "timestamp": "1504902988",
      "type": "text",
      "text": {"body": "this is a text message"}
    }]
  }
}'
```

**Resultado esperado:**
```json
{
  "status": "success"
}
```

**Logs esperados:**
```
[WhatsappController] Webhook recibido
[WhatsappController] Formato de prueba de Meta detectado - normalizando...
[WhatsappService] Mensaje recibido de: 16315551181
[WhatsappService] Tipo de mensaje: text
[WhatsappService] Texto: this is a text message
```

### 2. Payload Real de Producción
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "123456123",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "16505551111",
          "phone_number_id": "123456123"
        },
        "contacts": [{
          "profile": {"name": "test user name"},
          "wa_id": "16315551181"
        }],
        "messages": [{
          "from": "16315551181",
          "id": "ABGGFlA5Fpa",
          "timestamp": "1504902988",
          "type": "text",
          "text": {"body": "this is a text message"}
        }]
      }
    }]
  }]
}'
```

**Resultado esperado:**
```json
{
  "status": "success"
}
```

**Logs esperados:**
```
[WhatsappController] Webhook recibido
[WhatsappController] Formato de producción detectado
[WhatsappService] Mensaje recibido de: 16315551181
[WhatsappService] Tipo de mensaje: text
[WhatsappService] Texto: this is a text message
```

---

## 📊 Comparación de Formatos

### Estructura Visual

```
PAYLOAD DE PRUEBA DE META:
{
  field ─────────────┐
  value ─────────────┤
    ├─ messaging_product
    ├─ metadata
    ├─ contacts
    └─ messages
}

PAYLOAD REAL DE PRODUCCIÓN:
{
  object ────────────┐
  entry[] ───────────┤
    └─ changes[] ────┤
       ├─ field ─────┤ (igual al de prueba)
       └─ value ─────┤ (igual al de prueba)
          ├─ messaging_product
          ├─ metadata
          ├─ contacts
          └─ messages
}
```

---

## 🎯 Beneficios de la Solución

1. **✅ Compatible con Herramientas de Prueba de Meta**
   - Funciona con webhooks de prueba directamente
   - No requiere modificar el payload manualmente

2. **✅ Compatible con Producción**
   - Sigue funcionando con payloads reales
   - No rompe funcionalidad existente

3. **✅ Transparente para el Servicio**
   - El servicio `WhatsappService` no necesita cambios
   - Toda la normalización ocurre en el controller

4. **✅ Debugging Mejorado**
   - Logs claros indicando qué formato se detectó
   - Payload normalizado visible en logs de debug

---

## 🚨 Notas Importantes

### Para Desarrollo
- La herramienta de prueba de webhooks de Meta usa el formato simplificado
- En desarrollo, puedes usar cualquiera de los dos formatos

### Para Producción
- WhatsApp Cloud API SIEMPRE envía el formato completo con `object` y `entry`
- El formato de prueba solo lo usa la herramienta de testing de Meta

### Para Testing
- Usa el formato de prueba para tests locales rápidos
- Usa el formato completo para tests de integración

---

## 📝 Checklist de Verificación

- [x] Detecta formato de prueba de Meta
- [x] Detecta formato real de producción
- [x] Normaliza payload de prueba correctamente
- [x] Mantiene compatibilidad con código existente
- [x] Logging detallado para debugging
- [x] Sin errores de TypeScript
- [x] Sin errores de ESLint
- [x] Compilación exitosa

---

## 🔄 Flujo de Procesamiento

```
Webhook recibido
      ↓
¿Tiene 'object' y 'entry'?
      ↓
    SÍ → Formato de producción → Procesar directamente
      ↓
    NO → ¿Tiene 'field' y 'value'?
      ↓
    SÍ → Formato de prueba → Normalizar → Procesar
      ↓
    NO → Error: Formato no válido
```

---

## 🎓 Lecciones Aprendidas

1. **Las herramientas de testing de Meta no siempre envían el payload exacto de producción**
   - Importante probar con ambos formatos
   - Documentar las diferencias

2. **La validación estricta puede causar problemas en testing**
   - Mejor implementar normalización que rechazar formatos válidos
   - Mantener flexibilidad sin sacrificar seguridad

3. **El logging detallado es crucial**
   - Ayuda a identificar problemas rápidamente
   - Facilita el debugging en producción

---

## 📚 Referencias

- [WhatsApp Cloud API - Webhook Testing Tool](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks)
- [WhatsApp Cloud API - Messages Webhook Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/reference/messages)

---

**Fecha:** 30 de octubre de 2025  
**Versión:** 2.0.1  
**Estado:** ✅ Resuelto
