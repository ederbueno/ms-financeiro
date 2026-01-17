"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AppService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("./prisma.service");
const client_1 = require("@prisma/client");
let AppService = AppService_1 = class AppService {
    prisma;
    logger = new common_1.Logger(AppService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async gerarPagamento(dados) {
        const { vendaId, valorTotal, metodoPagamento } = dados;
        let metodoFormatado;
        const entrada = String(metodoPagamento || '').toUpperCase();
        if (entrada.includes('BOLETO'))
            metodoFormatado = client_1.MetodoPagamento.BOLETO;
        else if (entrada.includes('LINK') || entrada.includes('MAQUININHA'))
            metodoFormatado = client_1.MetodoPagamento.LINK_MAQUININHA;
        else
            metodoFormatado = client_1.MetodoPagamento.PIX;
        try {
            const pagamentoExistente = await this.prisma.pagamento.findUnique({
                where: { vendaId: String(vendaId) }
            });
            let metodoParaGravar = metodoFormatado;
            if (pagamentoExistente && metodoFormatado === client_1.MetodoPagamento.PIX) {
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
                    status: client_1.StatusPagamento.PENDENTE,
                    fatura: {
                        connectOrCreate: {
                            where: { vendaId: String(vendaId) },
                            create: { vendaId: String(vendaId), valor: valorTotal }
                        }
                    }
                }
            });
        }
        catch (error) {
            this.logger.error(`❌ Erro no gerarPagamento: ${error.message}`);
            throw error;
        }
    }
    async gerarFatura(data) {
        const vendaId = String(data.vendaId || data.id);
        const metodoPagamento = data.metodoPagamento || data.metodo_pagamento || data.payload?.metodoPagamento || 'PIX';
        const itens = data.itens || data.dadosVenda?.itens || data.payload?.itens;
        if (!itens || !Array.isArray(itens))
            return;
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
            return fatura;
        }
        catch (err) {
            this.logger.error(`❌ Erro no gerarFatura: ${err.message}`);
            throw err;
        }
    }
    async confirmarPagamento(vendaId) {
        this.logger.log(`Iniciando conciliação para venda: ${vendaId}`);
        try {
            const pagamento = await this.prisma.pagamento.update({
                where: { vendaId },
                data: {
                    status: client_1.StatusPagamento.PAGO,
                    pagoEm: new Date()
                },
            });
            this.logger.log(`✅ Pagamento confirmado com sucesso para a venda ${vendaId}`);
            return { sucesso: true, dados: pagamento };
        }
        catch (error) {
            this.logger.error(`❌ Erro ao confirmar pagamento no banco: ${error.message}`);
            throw error;
        }
    }
    async cancelarFatura(data) {
        const { vendaId } = data;
        this.logger.warn(`🔙 SAGA REVERSA: Cancelando pagamento da Venda: ${vendaId}`);
        try {
            await this.prisma.pagamento.update({
                where: { vendaId: String(vendaId) },
                data: { status: client_1.StatusPagamento.CANCELADO }
            });
            this.logger.log(`✅ Pagamento da Venda ${vendaId} estornado.`);
        }
        catch (err) {
            this.logger.error(`❌ Erro ao estornar: ${err.message}`);
            throw err;
        }
    }
    async buscarStatusCompleto(vendaId) {
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
};
exports.AppService = AppService;
exports.AppService = AppService = AppService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AppService);
//# sourceMappingURL=app.service.js.map