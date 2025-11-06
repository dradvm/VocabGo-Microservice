import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as morgan from 'morgan';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'game',
      protoPath: join(process.cwd(), 'proto/game.proto'),
      url: 'localhost:50057'
    }
  });
  app.use(morgan('dev'));
  await app.startAllMicroservices();
  await app.listen(3007);
}
bootstrap();
