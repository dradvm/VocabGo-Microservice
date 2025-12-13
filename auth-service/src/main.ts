import { NestFactory } from '@nestjs/core';
import * as morgan from 'morgan';
import { AppModule } from './app.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'auth',
      protoPath: join(process.cwd(), 'proto/auth.proto'),
      url: 'localhost:50051'
    }
  });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  app.use(morgan('dev'));
  await app.startAllMicroservices();
  await app.listen(3001);
}
bootstrap();
