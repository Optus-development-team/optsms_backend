// --------------------------------------------------------
// PROYECTO: OptuSBMS (SaaS Core)
// CONTEXTO: Integración con BMS_PAYMENT_BACKEND (Playwright)
// --------------------------------------------------------

Project OptuSBMS {
  database_type: 'PostgreSQL'
  Note: 'Base de datos maestra para orquestación SaaS Multi-tenant'
}

// --------------------------------------------------------
// ENUMS (Máquina de Estados)
// --------------------------------------------------------

Enum user_role {
  ADMIN   // Dueño (Recibe alertas de 2FA)
  CLIENT  // Cliente final
}

Enum order_status {
  CART              // Selección de productos
  AWAITING_QR       // POST /v1/fiat/generate-qr enviado (Job Queued)
  QR_SENT           // Webhook QR_GENERATED recibido (Imagen guardada)
  VERIFYING_PAYMENT // POST /v1/fiat/verify-payment enviado
  COMPLETED         // Webhook VERIFICATION_RESULT {success: true}
  FAILED            // Error en Playwright o Timeout
  REQUIRES_2FA      // Webhook LOGIN_2FA_REQUIRED recibido (Pausa el flujo)
}

Enum integration_provider {
  BANK_ECOFUTURO    // Usa FiatBrowserService (Playwright)
  WALLET_TRON       // Futuro: CryptoAutomation
}

// --------------------------------------------------------
// CORE SAAS & TENANCY
// --------------------------------------------------------

Table companies {
  id uuid [pk, default: `gen_random_uuid()`]
  name varchar [not null]
  whatsapp_phone_id varchar [unique, not null, note: 'Identificador para Webhooks de WhatsApp']
  
  // Configuración Global
  config jsonb [default: '{}', note: 'Configuración de tono, horarios, etc.']
  
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]
}

Table company_users {
  id uuid [pk, default: `gen_random_uuid()`]
  company_id uuid [ref: > companies.id, not null]
  phone varchar [not null, note: 'WhatsApp sender_id']
  role user_role [default: 'CLIENT']
  
  // Memoria Vectorial (Google ADK Session Context)
  embedding vector(1536) [note: 'Perfilamiento del usuario para el LLM']
  
  created_at timestamptz [default: `now()`]
  
  indexes {
    (company_id, phone) [unique]
  }
}

// --------------------------------------------------------
// INTEGRACIONES (La Bóveda de Credenciales)
// --------------------------------------------------------

Table company_integrations {
  id uuid [pk, default: `gen_random_uuid()`]
  company_id uuid [ref: > companies.id, not null]
  provider integration_provider [not null]
  
  // CREDENCIALES (Cifradas AES-256)
  // Para BANK_ECOFUTURO, el JSON descifrado debe ser:
  // { 
  //   "econet_user": "...", 
  //   "econet_pass": "..." 
  // }
  // Estas se inyectan en los selectores #usuario y #txtPassword del scraper.
  encrypted_credentials jsonb [not null] 
  
  // Estado de Salud de la Integración
  is_active boolean [default: true]
  needs_2fa_attention boolean [default: false, note: 'True si recibimos LOGIN_2FA_REQUIRED']
  last_2fa_request_at timestamptz
  
  updated_at timestamptz [default: `now()`]
}

// --------------------------------------------------------
// VENTAS Y ORQUESTACIÓN DE PAGOS
// --------------------------------------------------------

Table products {
  id uuid [pk, default: `gen_random_uuid()`]
  company_id uuid [ref: > companies.id]
  sku varchar
  name varchar
  price decimal(10, 2)
  stock_quantity int [note: 'Master Inventory']
  image_url text
}

Table orders {
  id uuid [pk, default: `gen_random_uuid()`]
  company_id uuid [ref: > companies.id, not null]
  user_id uuid [ref: > company_users.id, not null]
  
  total_amount decimal(12, 2) [not null, note: 'Se usa para validar campo #monto en Scraper']
  status order_status [default: 'CART']
  
  // DATOS CRÍTICOS PARA EL SCRAPER
  details varchar [not null, note: 'Glosa Única (REF-UUID). El scraper busca esto en el <td> del extracto bancario.']
  
  // METADATA DEL PROCESO DE PAGO
  // {
  //   "qr_image_base64": "data:image/png...",  <-- Guardado del webhook QR_GENERATED
  //   "playwright_job_id": "...",              <-- ID interno del JobQueueService
  //   "bank_ref": "..."                        <-- Referencia extraída si es exitoso
  // }
  metadata jsonb [default: '{}'] 
  
  created_at timestamptz [default: `now()`]
  updated_at timestamptz [default: `now()`]
}

Table order_items {
  id uuid [pk, default: `gen_random_uuid()`]
  order_id uuid [ref: > orders.id]
  product_id uuid [ref: > products.id]
  quantity int
  unit_price decimal(10, 2)
}

// --------------------------------------------------------
// SESIONES DE CHAT (Google ADK)
// --------------------------------------------------------

Table adk_sessions {
  session_id varchar [pk, note: 'company_id:user_phone']
  company_id uuid [ref: > companies.id]
  
  // Contexto serializado del ADK (Memoria conversacional)
  context_data jsonb 
  
  updated_at timestamptz [default: `now()`]
}