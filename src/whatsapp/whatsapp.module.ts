import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { PaymentWebhookController } from './payment-webhook.controller';
import { IdentityService } from './services/identity.service';
import { SanitizationService } from './services/sanitization.service';
import { AgentRouterService } from './services/agent-router.service';
import { AppointmentAgentService } from './agents/appointment-agent.service';
import { SalesAgentService } from './agents/sales-agent.service';
import { ReportingAgentService } from './agents/reporting-agent.service';
import { PaymentClientService } from './services/payment-client.service';
import { SupabaseService } from './services/supabase.service';
import { AdkSessionService } from './services/adk-session.service';

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [WhatsappController, PaymentWebhookController],
  providers: [
    WhatsappService,
    IdentityService,
    SanitizationService,
    AgentRouterService,
    AppointmentAgentService,
    SalesAgentService,
    ReportingAgentService,
    PaymentClientService,
    SupabaseService,
    AdkSessionService,
  ],
  exports: [WhatsappService],
})
export class WhatsappModule {}
