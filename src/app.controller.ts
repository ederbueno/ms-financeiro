import { Controller, Patch, Param, Get, HttpException, HttpStatus } from '@nestjs/common';
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

  @Get('notas/:vendaId')
  async gerarNota(@Param('vendaId') vendaId: string) {
    try {
      return await this.appService.gerarNotaFiscal(vendaId);
    } catch (error: any) {
      throw new HttpException(
        {
          statusCode: HttpStatus.NOT_FOUND,
          message: error.message || 'Fatura não encontrada',
        },
        HttpStatus.NOT_FOUND
      );
    }
  }
}
