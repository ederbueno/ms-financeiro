"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AppService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppService = void 0;
const common_1 = require("@nestjs/common");
const microservices_1 = require("@nestjs/microservices");
const prisma_service_1 = require("./prisma.service");
const client_1 = require("@prisma/client");
const fs = __importStar(require("fs"));
const PDFDocument = require("pdfkit");
const path = __importStar(require("path"));
let AppService = AppService_1 = class AppService {
    prisma;
    kafkaClient;
    logger = new common_1.Logger(AppService_1.name);
    constructor(prisma, kafkaClient) {
        this.prisma = prisma;
        this.kafkaClient = kafkaClient;
    }
    async gerarFatura(data) {
        this.logger.log(`📦 Processando mensagem de faturamento: ${JSON.stringify(data)}`);
        const vendaId = data.vendaId || data.id;
        const itens = data.itens || data.dadosVenda?.itens || data.payload?.itens;
        if (!itens || !Array.isArray(itens)) {
            this.logger.error(`❌ Venda ${vendaId} não possui lista de itens válida.`);
            return;
        }
        const valorTotal = itens.reduce((acc, i) => acc + (i.quantidade * (i.precoUnitario || 0)), 0);
        try {
            const fatura = await this.prisma.fatura.create({
                data: {
                    vendaId: String(vendaId),
                    valor: valorTotal,
                    status: 'PAGO',
                    notaFiscal: {
                        create: {
                            chaveAcesso: Math.random().toString().substring(2, 46),
                            xmlSimulado: `<xml>NF-e ${vendaId}</xml>`
                        }
                    }
                },
                include: { notaFiscal: true }
            });
            this.logger.log(`✅ Registro de Fatura criado no DB para Venda: ${vendaId}`);
            await this.gerarDanfePDF(data, fatura.notaFiscal, valorTotal);
            this.logger.log(`📑 PDF da Nota Fiscal gerado com sucesso para Venda: ${vendaId}`);
        }
        catch (err) {
            this.logger.error(`❌ Erro ao processar faturamento: ${err.message}`);
        }
    }
    async gerarDanfePDF(venda, nf, total) {
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
        doc.font('Helvetica');
        doc.fontSize(8).text(`CHAVE DE ACESSO: ${nf.chaveAcesso}`, 40, 60);
        doc.moveDown(4);
        doc.font('Helvetica-Bold').fontSize(12).text(`DESTINATÁRIO: ${venda.clienteId || 'CLIENTE PADRÃO'}`);
        doc.font('Helvetica');
        doc.text(`ID DA VENDA: ${venda.id || venda.vendaId}`);
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
        itens.forEach((item) => {
            doc.text(item.produtoId, 40, y);
            doc.text(item.quantidade.toString(), 300, y);
            doc.text(`R$ ${item.precoUnitario}`, 400, y);
            doc.text(`R$ ${item.quantidade * item.precoUnitario}`, 500, y);
            y += 15;
        });
        doc.moveDown();
        doc.font('Helvetica-Bold').fontSize(14).text(`VALOR TOTAL DA NOTA: R$ ${total.toFixed(2)}`, { align: 'right' });
        doc.font('Helvetica');
        doc.end();
        return new Promise((resolve) => writeStream.on('finish', () => resolve()));
    }
    async cancelarFatura(data) {
        const { vendaId } = data;
        this.logger.warn(`🔙 SAGA REVERSA: Cancelando fatura da Venda: ${vendaId}`);
        try {
            await this.prisma.fatura.update({
                where: { vendaId: String(vendaId) },
                data: { status: 'CANCELADO' }
            });
            this.logger.log(`✅ Fatura ${vendaId} estornada com sucesso.`);
        }
        catch (err) {
            this.logger.error(`❌ Erro ao estornar fatura: ${err.message}`);
        }
    }
    async gerarPagamento(dados) {
        const { vendaId, valorTotal, metodoPagamento } = dados;
        let urlPagamento = null;
        let pixCopiaECola = null;
        if (metodoPagamento === 'PIX') {
            pixCopiaECola = `00020126360014BR.GOV.BCB.PIX0114+551199999999${vendaId}`;
        }
        else if (metodoPagamento === 'BOLETO') {
            urlPagamento = `https://meuerp.com/download/boleto/${vendaId}.pdf`;
        }
        else if (metodoPagamento === 'LINK_MAQUININHA') {
            urlPagamento = `https://checkout.pagseguro.com.br/payment?id=${vendaId}`;
        }
        try {
            const pagamento = await this.prisma.pagamento.create({
                data: {
                    vendaId: vendaId,
                    valor: valorTotal,
                    metodo: metodoPagamento,
                    status: client_1.StatusPagamento.PENDENTE,
                    urlPagamento: urlPagamento,
                    pixCopiaECola: pixCopiaECola,
                },
            });
            console.log(`💰 [FINANCEIRO] Pagamento ${pagamento.id} gerado via ${metodoPagamento}`);
            return pagamento;
        }
        catch (error) {
            console.error(`❌ [FINANCEIRO] Erro ao salvar pagamento:`, error.message);
        }
    }
    async confirmarPagamento(vendaId) {
        const pagamento = await this.prisma.pagamento.update({
            where: { vendaId },
            data: {
                status: 'PAGO',
                pagoEm: new Date()
            }
        });
        console.log(`✅ [FINANCEIRO] Pagamento da venda ${vendaId} confirmado e enviado ao Kafka.`);
        return { mensagem: 'Pagamento confirmado com sucesso', pagamento };
    }
};
exports.AppService = AppService;
exports.AppService = AppService = AppService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)('KAFKA_SERVICE')),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        microservices_1.ClientKafka])
], AppService);
//# sourceMappingURL=app.service.js.map