import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        brokers: [process.env.KAFKA_BROKER || 'localhost:29092'],
      },
      consumer: {
        groupId: 'financeiro-consumer-server',
      },
    },
  });

  await app.startAllMicroservices();
  await app.listen(3001);

  const logger = new (require('@nestjs/common').Logger)('Bootstrap');
  logger.log('💰 Financeiro Híbrido (HTTP + KAFKA) pronto na porta 3001!');

}
bootstrap();