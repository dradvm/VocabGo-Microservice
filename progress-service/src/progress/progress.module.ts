import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';

@Module({
  imports: [
    PrismaModule,
    ClientsModule.register([
      {
        transport: Transport.GRPC,
        name: 'GAME_GRPC_SERVICE',
        options: {
          package: 'game',
          protoPath: join(process.cwd(), 'proto/game.proto'),
          url: 'localhost:50057'
        }
      },
      {
        name: 'USER_PUBLISHER',
        transport: Transport.RMQ,
        options: {
          urls: ['amqp://localhost:5672'],
          queue: 'user_queue',
          queueOptions: { durable: true }
        }
      },
      {
        name: 'USER_GRPC_SERVICE', // 👈 tên để inject
        transport: Transport.GRPC,
        options: {
          package: 'user',
          protoPath: join(process.cwd(), 'proto/user.proto'),
          url: 'localhost:50054' // 👈 trỏ tới user_service
        }
      }
    ])
  ],
  controllers: [ProgressController],
  providers: [ProgressService]
})
export class ProgressModule {}
