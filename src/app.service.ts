import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { MetodoPagamento, StatusPagamento } from '@prisma/client';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private prisma: PrismaService) {}

  async gerarPagamento(dados: any) {
    const { vendaId, valorTotal, metodoPagamento } = dados;
    let metodoFormatado: MetodoPagamento;
    const entrada = String(metodoPagamento || '').toUpperCase();
    if (entrada.includes('BOLETO')) metodoFormatado = MetodoPagamento.BOLETO;
    else if (entrada.includes('LINK') || entrada.includes('MAQUININHA')) metodoFormatado = MetodoPagamento.LINK_MAQUININHA;
    else metodoFormatado = MetodoPagamento.PIX;

    try {    
      const pagamentoExistente = await this.prisma.pagamento.findUnique({
        where: { vendaId: String(vendaId) }
      });
   
      let metodoParaGravar = metodoFormatado;
      if (pagamentoExistente && metodoFormatado === MetodoPagamento.PIX) {
        this.logger.log(`⚠️ Ignorando sobrescrita de PIX para venda ${vendaId}. Mantendo método anterior.`);
        metodoParaGravar = pagamentoExistente.metodo;
      }

      return await this.prisma.pagamento.upsert({
        where: { vendaId: String(vendaId) },
        update: {
          metodo: metodoParaGravar,
          valor: valorTotal
        },
        create: {
          vendaId: String(vendaId),
          valor: valorTotal,
          metodo: metodoParaGravar,
          status: StatusPagamento.PENDENTE,
          fatura: {
            connectOrCreate: {
              where: { vendaId: String(vendaId) },
              create: { vendaId: String(vendaId), valor: valorTotal }
            }
          }
        }
      });
    } catch (error: any) {
      this.logger.error(`❌ Erro no gerarPagamento: ${error.message}`);
      throw error;
    }
  }

  async gerarFatura(data: any) {
    const vendaId = String(data.vendaId || data.id);
    const metodoPagamento = data.metodoPagamento || data.metodo_pagamento || data.payload?.metodoPagamento || 'PIX';
    const itens = data.itens || data.dadosVenda?.itens || data.payload?.itens;

    if (!itens || !Array.isArray(itens)) return;
    const valorTotal = itens.reduce((acc: number, i: any) => acc + (i.quantidade * (i.precoUnitario || 0)), 0);

    try {
      const fatura = await this.prisma.fatura.upsert({
        where: { vendaId },
        update: { valor: valorTotal },
        create: {
          vendaId,
          valor: valorTotal,
          notaFiscal: {
            create: {
              chaveAcesso: Math.random().toString().substring(2, 46),
              xmlSimulado: `<xml>NF-e ${vendaId}</xml>`
            }
          }
        },
        include: { notaFiscal: true }
      });
      
      await this.gerarPagamento({
        vendaId,
        valorTotal,
        metodoPagamento,
        faturaId: fatura.id
      });

      return fatura;
    } catch (err: any) {
      this.logger.error(`❌ Erro no gerarFatura: ${err.message}`);
      throw err;
    }
  }

  async confirmarPagamento(vendaId: string) {
    this.logger.log(`Iniciando conciliação para venda: ${vendaId}`);
    try {
      const pagamento = await this.prisma.pagamento.update({
        where: { vendaId },
        data: {
          status: StatusPagamento.PAGO,
          pagoEm: new Date()
        },
      });
     
      this.logger.log(`✅ Pagamento confirmado com sucesso para a venda ${vendaId}`);
      return { sucesso: true, dados: pagamento };
    } catch (error: any) {
      this.logger.error(`❌ Erro ao confirmar pagamento no banco: ${error.message}`);
      throw error;
    }
  }

  async cancelarFatura(data: any) {
    const { vendaId } = data;
    this.logger.warn(`🔙 SAGA REVERSA: Cancelando pagamento da Venda: ${vendaId}`);

    try {
      await this.prisma.pagamento.update({
        where: { vendaId: String(vendaId) },
        data: { status: StatusPagamento.CANCELADO }
      });
      this.logger.log(`✅ Pagamento da Venda ${vendaId} estornado.`);
    } catch (err: any) {
      this.logger.error(`❌ Erro ao estornar: ${err.message}`);
      throw err;
    }
  }

  async buscarStatusCompleto(vendaId: string) {
    const fatura = await this.prisma.fatura.findUnique({
      where: { vendaId },
      include: { pagamento: true }
    });

    if (!fatura || !fatura.pagamento) {
      return { erro: 'Fatura ou Pagamento não encontrado' };
    }
    return {
      vendaId,
      faturaStatus: 'GERADA',
      pagamentoStatus: fatura.pagamento.status,
      conciliado: true,
      valor: fatura.valor,
      metodo: fatura.pagamento.metodo,
      pagoEm: fatura.pagamento.pagoEm,
    };
  }
}
