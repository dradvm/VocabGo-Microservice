import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';

@Module({
  imports: [
    PrismaModule,
    ClientsModule.register([
      {
        name: 'PROGRESS_PUBLISHER',
        transport: Transport.RMQ,
        options: {
          urls: ['amqp://localhost:5672'],
          queue: 'progress_queue',
          queueOptions: { durable: true }
        }
      }
    ])
  ],
  controllers: [UserController],
  providers: [UserService]
})
export class UserModule {}
