import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { OAuth2Client } from 'google-auth-library';
import { JwtModule } from '@nestjs/jwt';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';

const GoogleOAuthProvider = {
  provide: 'GOOGLE_OAUTH_CLIENT',
  useFactory: () =>
    new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )
};

@Module({
  imports: [
    JwtModule,
    ClientsModule.register([
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
  controllers: [AuthController],
  providers: [AuthService, GoogleOAuthProvider]
})
export class AuthModule {}
