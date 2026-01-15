import { Controller, Patch, Param, Get } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { AppService } from './app.service';

@Controller('pagamento')
export class AppController {
  constructor(private readonly appService: AppService) {}


  @Patch('confirmar/:vendaId')
  async confirmar(@Param('vendaId') vendaId: string) {
    return await this.appService.confirmarPagamento(vendaId);
  }

  @Get('status/:vendaId')
  async getStatus(@Param('vendaId') vendaId: string) {
    return await this.appService.buscarStatusCompleto(vendaId);
  }

  @EventPattern('venda_realizada')
  async handlePagamentoPendente(@Payload() data: any) {
    console.log(`📩 [Financeiro] Gerando link de pagamento para: ${data.vendaId}`);
    await this.appService.gerarPagamento(data);
  }

  @EventPattern('venda_concluida') 
  async handleLogisticaSucesso(@Payload() data: any) {
    console.log(`💰 [Financeiro] Capturando evento de venda concluída: ${data.vendaId}`);
    await this.appService.gerarFatura(data);
  }

  @EventPattern('logistica_falhou')
  async handleLogisticaErro(@Payload() data: any) {
    console.log(`⚠️ [Financeiro] Cancelando processo devido à falha logística: ${data.vendaId}`);
    await this.appService.cancelarFatura(data);
  }
}