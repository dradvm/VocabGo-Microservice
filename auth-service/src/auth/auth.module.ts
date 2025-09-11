import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { OAuth2Client } from 'google-auth-library';
import { JwtModule } from '@nestjs/jwt';

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
  imports: [JwtModule],
  controllers: [AuthController],
  providers: [AuthService, GoogleOAuthProvider]
})
export class AuthModule {}
