import { Controller, Patch, Param, Get } from '@nestjs/common';
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

  @Get('health')
  health() {
    return { status: 'ok', service: 'ms-financeiro' };
  }
}
