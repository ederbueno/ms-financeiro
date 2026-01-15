import { ClientKafka } from '@nestjs/microservices';
import { PrismaService } from './prisma.service';
export declare class AppService {
    private prisma;
    private readonly kafkaClient;
    private readonly logger;
    constructor(prisma: PrismaService, kafkaClient: ClientKafka);
    gerarFatura(data: any): Promise<void>;
    private gerarDanfePDF;
    cancelarFatura(data: any): Promise<void>;
    gerarPagamento(dados: any): Promise<{
        vendaId: string;
        id: string;
        valor: number;
        status: import("@prisma/client").$Enums.StatusPagamento;
        createdAt: Date;
        metodo: import("@prisma/client").$Enums.MetodoPagamento;
        urlPagamento: string | null;
        pixCopiaECola: string | null;
        pagoEm: Date | null;
    } | undefined>;
    confirmarPagamento(vendaId: string): Promise<{
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
}
