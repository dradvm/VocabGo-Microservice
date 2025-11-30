import { ClientsModule, Transport } from '@nestjs/microservices';
import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { QuestController } from './quest.controller';
import { QuestService } from './quest.service';

@Module({
  imports: [
    PrismaModule,
    ClientsModule.register([
      {
        name: 'USER_PUBLISHER',
        transport: Transport.RMQ,
        options: {
          urls: ['amqp://localhost:5672'],
          queue: 'user_queue',
          queueOptions: { durable: true }
        }
      }
    ])
  ],
  controllers: [QuestController],
  providers: [QuestService]
})
export class QuestModule {}
