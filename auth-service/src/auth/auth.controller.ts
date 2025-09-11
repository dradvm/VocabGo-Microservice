import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthService } from './auth.service';
import { OAuth2Client } from 'google-auth-library';
import { Request } from 'express';
import { auth_sessions } from '@prisma/client';

@Controller('')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    @Inject('GOOGLE_OAUTH_CLIENT') private readonly googleClient: OAuth2Client
  ) {}

  @Post('google-login')
  async googleLogin(
    @Body('idToken') idToken: string,
    @Body('deviceInfo') deviceInfo: string,
    @Body('refreshToken') refreshToken: string | null,
    @Req() req: Request
  ) {
    const ticket = await this.googleClient.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    if (!payload) {
      return { status: 'error', message: 'Invalid ID token' };
    }

    let user = await this.authService.isAuthUserExist({
      email: payload.email!
    });
    const ip: string = ((req.headers['x-forwarded-for'] as string)
      ?.split(',')[0]
      .trim() ||
      req.ip ||
      req.connection.remoteAddress) as string;
    if (user != null) {
      if (user.status === 'banned') {
        return { status: 'error', message: 'User is banned' };
      }
      const provider = await this.authService.isAuthProviderExist({
        provider: 'google',
        provider_user_id: payload.sub
      });

      const payloadToken = {
        sub: user.id,
        role: 'user',
        status: 'active'
      };
      const newAccessToken = this.authService.getToken('ACCESS', payloadToken);
      const newRefreshToken = this.authService.getToken(
        'REFRESH',
        payloadToken
      );
      let session: auth_sessions | null = null;
      if (refreshToken) {
        session = await this.authService.isAuthSessionExist({
          refresh_token: refreshToken
        });
      }
      if (!provider) {
        await this.authService.createAuthProvider({
          auth_user_id: user.id,
          provider: 'google',
          provider_user_id: payload.sub,
          email: payload.email!,
          display_name: payload.name,
          avatar_url: payload.picture
        });
      }

      if (session) {
        await this.prisma.auth_sessions.update({
          where: { id: session.id },
          data: {
            device_info: deviceInfo,
            user_agent: req.headers['user-agent'] || 'unknown',
            ip_address: ip,
            refresh_token: newRefreshToken,
            expires_at: new Date(Date.now() + this.authService.ttlMs) // 7 days
          }
        });
      } else {
        await this.authService.createAuthSession(
          user.id,
          deviceInfo,
          req.headers['user-agent'] || 'unknown',
          ip,
          newRefreshToken
        );
      }

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      };
    } else {
      const results = await this.prisma.$transaction(async () => {
        user = await this.authService.createAuthUser({ email: payload.email! });
        await this.authService.createAuthProvider({
          auth_user_id: user.id,
          provider: 'google',
          provider_user_id: payload.sub,
          email: payload.email!,
          display_name: payload.name,
          avatar_url: payload.picture
        });

        const payloadToken = {
          sub: user.id,
          role: 'user',
          status: 'active'
        };

        const newAccessToken = this.authService.getToken(
          'ACCESS',
          payloadToken
        );
        const newRefreshToken = this.authService.getToken(
          'REFRESH',
          payloadToken
        );

        await this.authService.createAuthSession(
          user.id,
          deviceInfo,
          req.headers['user-agent'] || 'unknown',
          ip,
          newRefreshToken
        );

        return {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken
        };
      });
      return results;
    }
  }

  @Post('refresh-token')
  async refreshToken(@Body('refreshToken') refreshToken: string) {
    console.log('refresh');
    return this.authService.grantNewToken(refreshToken);
  }
}
