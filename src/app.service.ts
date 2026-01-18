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

  async gerarNotaFiscal(vendaId: string) {
    try {
      let fatura = await this.prisma.fatura.findUnique({
        where: { vendaId },
        include: { 
          pagamento: true,
          notaFiscal: true
        }
      });

      // Se não encontrar fatura, criar uma simulada para demonstração
      if (!fatura) {
        this.logger.warn(`⚠️ Fatura não encontrada para vendaId: ${vendaId}. Criando simulada...`);
        
        // Criar fatura simulada
        fatura = await this.prisma.fatura.create({
          data: {
            vendaId,
            valor: 100.00, // Valor padrão simulado
            pagamento: {
              create: {
                vendaId,
                valor: 100.00,
                metodo: MetodoPagamento.PIX,
                status: StatusPagamento.PAGO,
                pagoEm: new Date()
              }
            },
            notaFiscal: {
              create: {
                chaveAcesso: Math.random().toString().substring(2, 46),
                xmlSimulado: `<xml>NF-e ${vendaId}</xml>`
              }
            }
          },
          include: {
            pagamento: true,
            notaFiscal: true
          }
        });
        
        this.logger.log(`✅ Fatura simulada criada para vendaId: ${vendaId}`);
      }

      // Simular dados de venda (em produção, buscar do ms-vendas)
      const html = this.gerarHtmlNota(vendaId, fatura);
      
      // Converter HTML para Buffer base64
      const buffer = Buffer.from(html, 'utf-8');
      this.logger.log(`✅ Nota fiscal gerada com sucesso para vendaId: ${vendaId}`);
      
      return {
        filename: `Nota-${vendaId}.html`,
        content: buffer.toString('base64'),
        html,
      };
    } catch (error: any) {
      this.logger.error(`❌ Erro ao gerar nota fiscal: ${error.message}`);
      throw error;
    }
  }

  private gerarHtmlNota(vendaId: string, fatura: any): string {
    const { pagamento, notaFiscal } = fatura;
    const dataEmissao = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nota Fiscal - ${vendaId}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Arial', sans-serif; background: #f5f5f5; color: #333; }
          .container { max-width: 800px; margin: 20px auto; background: white; padding: 40px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
          .header { text-align: center; border-bottom: 3px solid #2c3e50; padding-bottom: 20px; margin-bottom: 20px; }
          .header h1 { color: #2c3e50; font-size: 28px; margin-bottom: 5px; }
          .header p { color: #7f8c8d; font-size: 14px; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin: 20px 0; }
          .info-section { padding: 15px; background: #ecf0f1; border-radius: 5px; }
          .info-section h3 { color: #2c3e50; font-size: 14px; font-weight: bold; margin-bottom: 10px; text-transform: uppercase; }
          .info-section p { font-size: 13px; line-height: 1.6; margin-bottom: 5px; }
          .info-section strong { color: #2c3e50; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          thead { background: #2c3e50; color: white; }
          th { padding: 12px; text-align: left; font-weight: bold; border: 1px solid #34495e; }
          td { padding: 12px; border: 1px solid #bdc3c7; }
          tbody tr:nth-child(even) { background: #f9f9f9; }
          tbody tr:hover { background: #ecf0f1; }
          .totals { margin: 20px 0; text-align: right; padding: 20px; background: #ecf0f1; border-radius: 5px; }
          .totals p { font-size: 14px; margin: 8px 0; }
          .total-value { font-size: 18px; font-weight: bold; color: #27ae60; margin-top: 10px; padding-top: 10px; border-top: 2px solid #27ae60; }
          .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #bdc3c7; text-align: center; font-size: 11px; color: #7f8c8d; }
          .badge { display: inline-block; padding: 5px 12px; border-radius: 3px; font-size: 12px; font-weight: bold; margin-bottom: 10px; }
          .badge-pago { background: #27ae60; color: white; }
          .badge-pendente { background: #e74c3c; color: white; }
          .nf-number { font-family: 'Courier New', monospace; font-size: 12px; color: #7f8c8d; margin-top: 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📄 NOTA FISCAL</h1>
            <p>Documento de Venda Eletrônico</p>
          </div>

          <div class="info-grid">
            <div class="info-section">
              <h3>Dados da Nota</h3>
              <p><strong>Número:</strong> ${vendaId}</p>
              <p><strong>Data de Emissão:</strong> ${dataEmissao}</p>
              <p><strong>Valor Total:</strong> R$ ${fatura.valor?.toFixed(2) || '0.00'}</p>
              ${notaFiscal ? `<p><strong>Chave de Acesso:</strong></p><div class="nf-number">${notaFiscal.chaveAcesso}</div>` : ''}
            </div>
            <div class="info-section">
              <h3>Dados do Pagamento</h3>
              <p><strong>Método:</strong> ${pagamento?.metodo || 'Não informado'}</p>
              <p><strong>Status:</strong> <span class="badge ${pagamento?.status === 'PAGO' ? 'badge-pago' : 'badge-pendente'}">${pagamento?.status || 'PENDENTE'}</span></p>
              ${pagamento?.pagoEm ? `<p><strong>Data de Pagamento:</strong> ${new Date(pagamento.pagoEm).toLocaleDateString('pt-BR')}</p>` : ''}
            </div>
          </div>

          <div style="margin: 30px 0;">
            <h3 style="color: #2c3e50; font-size: 14px; margin-bottom: 15px; text-transform: uppercase;">Resumo Financeiro</h3>
            <table>
              <thead>
                <tr>
                  <th>Descrição</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Subtotal</strong></td>
                  <td>R$ ${fatura.valor?.toFixed(2) || '0.00'}</td>
                </tr>
                <tr>
                  <td><strong>Impostos</strong></td>
                  <td>R$ 0.00</td>
                </tr>
                <tr style="background: #ecf0f1; font-weight: bold; font-size: 16px;">
                  <td>TOTAL</td>
                  <td>R$ ${fatura.valor?.toFixed(2) || '0.00'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="footer">
            <p>Este documento foi gerado automaticamente pelo Sistema ERP</p>
            <p>Data e Hora: ${new Date().toLocaleString('pt-BR')}</p>
            <p style="margin-top: 15px; color: #95a5a6;">Conserve este documento para fins de comprovação</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
