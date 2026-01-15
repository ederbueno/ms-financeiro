import { AppService } from './app.service';
export declare class AppController {
    private readonly appService;
    constructor(appService: AppService);
    confirmar(vendaId: string): Promise<{
        mensagem: string;
        pagamento: {
            vendaId: string;
            id: string;
            valor: number;
            status: import("@prisma/client").$Enums.StatusPagamento;
            createdAt: Date;
            metodo: import("@prisma/client").$Enums.MetodoPagamento;
            urlPagamento: string | null;
            pixCopiaECola: string | null;
            pagoEm: Date | null;
        };
    }>;
    handlePagamentoPendente(data: any): Promise<void>;
    handleLogisticaSucesso(data: any): Promise<void>;
    handleLogisticaErro(data: any): Promise<void>;
}
