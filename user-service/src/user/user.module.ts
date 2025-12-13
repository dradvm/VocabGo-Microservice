import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';

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
      },
      {
        name: 'AUTH_GRPC_SERVICE', // 👈 tên để inject
        transport: Transport.GRPC,
        options: {
          package: 'auth',
          protoPath: join(process.cwd(), 'proto/auth.proto'),
          url: 'localhost:50051' // 👈 trỏ tới user_service
        }
      }
    ])
  ],
  controllers: [UserController],
  providers: [UserService]
})
export class UserModule {}
