import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { PaymentOrder, PaymentState } from '../whatsapp.types';

interface OrderRow {
  id: string;
}

@Injectable()
export class OrdersSyncService {
  private readonly logger = new Logger(OrdersSyncService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async syncDraft(order: PaymentOrder): Promise<string | undefined> {
    if (!this.supabase.isEnabled() || !order.userId || !order.amount) {
      return order.supabaseOrderId;
    }

    const state = this.mapState(order.state);
    const metadata = {
      client_phone: order.clientPhone,
      details: order.details,
    };

    const rows = await this.supabase.query<OrderRow>(
      `INSERT INTO public.orders (company_id, user_id, total_amount, status, details, metadata)
       VALUES ($1, $2, $3, $4::order_status, $5, $6::jsonb)
       ON CONFLICT (company_id, details)
       DO UPDATE SET total_amount = EXCLUDED.total_amount, status = EXCLUDED.status, metadata = EXCLUDED.metadata, updated_at = now()
       RETURNING id`,
      [
        order.companyId,
        order.userId,
        order.amount,
        state,
        order.details,
        JSON.stringify(metadata),
      ],
    );

    const dbId = rows[0]?.id;
    if (!dbId) {
      this.logger.warn('No se pudo guardar la orden en Supabase');
      return order.supabaseOrderId;
    }

    return dbId;
  }

  async updateStatus(order: PaymentOrder): Promise<void> {
    if (!this.supabase.isEnabled() || !order.supabaseOrderId) {
      return;
    }

    await this.supabase.query(
      `UPDATE public.orders
       SET status = $2::order_status, updated_at = now()
       WHERE id = $1`,
      [order.supabaseOrderId, this.mapState(order.state)],
    );
  }

  private mapState(state: PaymentState): string {
    switch (state) {
      case PaymentState.AWAITING_QR:
        return 'AWAITING_QR';
      case PaymentState.QR_SENT:
        return 'QR_SENT';
      case PaymentState.VERIFYING:
        return 'VERIFYING_PAYMENT';
      case PaymentState.COMPLETED:
        return 'COMPLETED';
      case PaymentState.CART:
      default:
        return 'CART';
    }
  }
}
