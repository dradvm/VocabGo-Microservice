import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  Req,
  Res
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthService } from './auth.service';
import { OAuth2Client } from 'google-auth-library';
import { Request, Response } from 'express';
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

      console.log({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      });
      await this.prisma.auth_users.update({
        where: { id: user.id },
        data: { last_login_at: new Date() }
      });
      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      };
    } else {
      const results = await this.prisma.$transaction(async () => {
        user = await this.authService.createAuthUser(
          { email: payload.email! },
          payload
        );
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
      console.log(results);
      return results;
    }
  }

  @Post('admin')
  async createAdminAccount(
    @Body('username') username: string,
    @Body('password') password: string,
    @Body('email') email?: string
  ) {
    return this.authService.createAdminAccount(username, password, email);
  }
  @Post('admin/login')
  async loginAdmin(
    @Body('username') username: string,
    @Body('password') password: string,
    @Res() res: Response
  ) {
    const token = await this.authService.loginAdmin(username, password);
    res.cookie('refreshToken', token.refreshToken, {
      httpOnly: true,
      secure: true, // bật khi dùng https
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 ngày
    });
    return res.json({
      accessToken: token.accessToken
    });
  }

  @Post('refresh-token')
  async refreshToken(
    @Req() req: Request,
    @Body('refreshToken') refreshToken: string
  ) {
    return this.authService.grantNewToken(refreshToken);
  }
  @Post('logout')
  async logout(@Body('refreshToken') refreshToken: string) {
    return this.authService.logout(refreshToken);
  }
}
