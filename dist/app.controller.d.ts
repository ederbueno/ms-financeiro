import { AppService } from './app.service';
export declare class AppController {
    private readonly appService;
    constructor(appService: AppService);
    confirmar(vendaId: string): Promise<{
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
    getStatus(vendaId: string): Promise<{
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
    health(): {
        status: string;
        service: string;
    };
}
