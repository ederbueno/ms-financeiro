import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { PrismaService } from './prisma.service';
import { MetodoPagamento, StatusPagamento } from '@prisma/client';
import * as fs from 'fs';
import PDFDocument = require('pdfkit');
import * as path from 'path';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private prisma: PrismaService,
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    try {
      await this.kafkaClient.connect();
      this.logger.log('📡 Conectado ao Kafka para envio de eventos');
    } catch (err) {
      this.logger.error(`❌ Erro ao conectar ao Kafka: ${err.message}`);
    }
  }

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
  } catch (error) {
    this.logger.error(`❌ Erro no gerarPagamento: ${error.message}`);
  }
}

async gerarFatura(data: any) {
  const vendaId = String(data.vendaId || data.id);
  const metodoPagamento = data.metodoPagamento || data.metodo_pagamento || data.payload?.metodoPagamento || 'PIX';
  const itens = data.itens || data.dadosVenda?.itens || data.payload?.itens;

  if (!itens || !Array.isArray(itens)) return;
  const valorTotal = itens.reduce((acc, i) => acc + (i.quantidade * (i.precoUnitario || 0)), 0);

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

    if (fatura.notaFiscal) {
      await this.gerarDanfePDF(data, fatura.notaFiscal, valorTotal);
    }
  } catch (err) {
    this.logger.error(`❌ Erro no gerarFatura: ${err.message}`);
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
   
    try {
      this.kafkaClient.emit('pagamento_confirmado', {
        vendaId: pagamento.vendaId,
        status: 'PAGO',
        confirmadoEm: pagamento.pagoEm,
      });
      this.logger.log(`📡 Evento 'pagamento_confirmado' enviado ao Kafka`);
    } catch (kafkaError) {
      this.logger.error(`⚠️ Erro ao comunicar com Kafka, mas o banco foi atualizado: ${kafkaError.message}`);
    }

    this.logger.log(`✅ Pagamento confirmado com sucesso para a venda ${vendaId}`);
    return { sucesso: true, dados: pagamento };
  } catch (error) {
    this.logger.error(`❌ Erro ao confirmar pagamento no banco: ${error.message}`);
    throw error;
  }
}

  private async gerarDanfePDF(venda: any, nf: any, total: number) {
    const doc = new PDFDocument({ size: 'A4', margin: 30 });
    const directory = '/app/notas';

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    const filePath = path.join(directory, `NF-Venda-${venda.id || venda.vendaId}.pdf`);
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    doc.rect(30, 30, 535, 50).stroke();
    doc.font('Helvetica-Bold').fontSize(16).text('DANFE - NOTA FISCAL ELETRÔNICA', 40, 40);
    doc.font('Helvetica').fontSize(8).text(`CHAVE DE ACESSO: ${nf.chaveAcesso}`, 40, 60);
    doc.moveDown(4);
    doc.font('Helvetica-Bold').fontSize(12).text(`DESTINATÁRIO: ${venda.clienteId || 'CLIENTE PADRÃO'}`);
    doc.font('Helvetica').text(`ID DA VENDA: ${venda.id || venda.vendaId}`);
    doc.text(`DATA: ${new Date().toLocaleString('pt-BR')}`);

    doc.moveDown();
    doc.rect(30, 150, 535, 20).fill('#333');
    doc.fillColor('white').text('PRODUTO', 40, 157);
    doc.text('QTD', 300, 157);
    doc.text('PREÇO UNIT', 400, 157);
    doc.text('TOTAL', 500, 157);

    let y = 180;
    doc.fillColor('black');
    const itens = venda.itens || venda.dadosVenda?.itens || [];
    itens.forEach((item: any) => {
      doc.text(item.produtoId, 40, y);
      doc.text(item.quantidade.toString(), 300, y);
      doc.text(`R$ ${item.precoUnitario}`, 400, y);
      doc.text(`R$ ${item.quantidade * item.precoUnitario}`, 500, y);
      y += 15;
    });

    doc.moveDown();
    doc.font('Helvetica-Bold').fontSize(14).text(`VALOR TOTAL DA NOTA: R$ ${total.toFixed(2)}`, { align: 'right' });
    doc.end();
    return new Promise<void>((resolve) => writeStream.on('finish', () => resolve()));
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
    } catch (err) {
      this.logger.error(`❌ Erro ao estornar: ${err.message}`);
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