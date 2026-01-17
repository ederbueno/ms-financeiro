import { PrismaService } from './prisma.service';
export declare class AppService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    gerarPagamento(dados: any): Promise<{
        vendaId: string;
        id: string;
        faturaId: string;
        valor: number;
        metodo: import("@prisma/client").$Enums.MetodoPagamento;
        status: import("@prisma/client").$Enums.StatusPagamento;
        pagoEm: Date | null;
    }>;
    gerarFatura(data: any): Promise<({
        notaFiscal: {
            id: string;
            faturaId: string;
            createdAt: Date;
            chaveAcesso: string;
            xmlSimulado: string;
        } | null;
    } & {
        vendaId: string;
        id: string;
        valor: number;
        createdAt: Date;
    }) | undefined>;
    confirmarPagamento(vendaId: string): Promise<{
        sucesso: boolean;
        dados: {
            vendaId: string;
            id: string;
            faturaId: string;
            valor: number;
            metodo: import("@prisma/client").$Enums.MetodoPagamento;
            status: import("@prisma/client").$Enums.StatusPagamento;
            pagoEm: Date | null;
        };
    }>;
    cancelarFatura(data: any): Promise<void>;
    buscarStatusCompleto(vendaId: string): Promise<{
        erro: string;
        vendaId?: undefined;
        faturaStatus?: undefined;
        pagamentoStatus?: undefined;
        conciliado?: undefined;
        valor?: undefined;
        metodo?: undefined;
        pagoEm?: undefined;
    } | {
        vendaId: string;
        faturaStatus: string;
        pagamentoStatus: import("@prisma/client").$Enums.StatusPagamento;
        conciliado: boolean;
        valor: number;
        metodo: import("@prisma/client").$Enums.MetodoPagamento;
        pagoEm: Date | null;
        erro?: undefined;
    }>;
}
