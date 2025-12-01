import type { WhatsAppIncomingMessage } from './interfaces/whatsapp.interface';

export enum UserRole {
  ADMIN = 'ROLE_ADMIN',
  CLIENT = 'ROLE_CLIENT',
}

export enum Intent {
  BOOKING = 'INTENT_BOOKING',
  SHOPPING = 'INTENT_SHOPPING',
  REPORTING = 'INTENT_REPORTING',
  TWO_FA = 'INTENT_2FA_REPLY',
}

export enum PaymentState {
  CART = 'STATE_CART',
  AWAITING_QR = 'STATE_AWAITING_QR',
  QR_SENT = 'STATE_QR_SENT',
  VERIFYING = 'STATE_VERIFYING',
  COMPLETED = 'STATE_COMPLETED',
}

export interface SanitizationToken {
  placeholder: string;
  rawValue: string;
  kind: 'phone' | 'email' | 'name' | 'address';
}

export interface SanitizedTextResult {
  sanitizedText: string;
  normalizedText: string;
  tokens: SanitizationToken[];
}

export interface TenantContext {
  companyId: string;
  companyName: string;
  companyConfig: Record<string, any>;
  phoneNumberId: string;
}

export interface AdkSessionSnapshot {
  sessionId: string;
  companyId: string;
  senderId: string;
  context: Record<string, unknown>;
}

export interface RouterMessageContext {
  senderId: string;
  whatsappMessageId: string;
  originalText: string;
  message: WhatsAppIncomingMessage;
  tenant: TenantContext;
  role: UserRole;
  adkSession: AdkSessionSnapshot;
}

export type RouterAction = {
  type: 'text';
  text: string;
};

export interface AgentResponse {
  actions: RouterAction[];
  metadata?: Record<string, unknown>;
}

export interface RouterResult extends AgentResponse {
  role: UserRole;
  intent: Intent | 'FALLBACK';
  sanitized: SanitizedTextResult;
}

export interface PaymentOrder {
  orderId: string;
  clientPhone: string;
  state: PaymentState;
  amount?: number;
  details: string;
  awaitingTwoFa?: boolean;
  lastUpdate: Date;
  companyId: string;
}
