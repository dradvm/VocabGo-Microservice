import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { auth_providers, auth_sessions, auth_users } from '@prisma/client';
import { StringValue } from 'ms';
import * as ms from 'ms';
import { PrismaService } from 'src/prisma/prisma.service';
import { PayloadToken } from 'src/types/payloadToken';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async isAuthUserExist(payload: {
    email: string;
  }): Promise<auth_users | null> {
    return await this.prisma.auth_users.findUnique({
      where: { primary_email: payload.email }
    });
  }

  async isAuthProviderExist(payload: {
    provider: string;
    provider_user_id: string;
  }): Promise<auth_providers | null> {
    return await this.prisma.auth_providers.findFirst({
      where: {
        provider: payload.provider,
        provider_user_id: payload.provider_user_id
      }
    });
  }

  async isAuthSessionExist(payload: {
    refresh_token: string;
  }): Promise<auth_sessions | null> {
    return await this.prisma.auth_sessions.findFirst({
      where: {
        refresh_token: payload.refresh_token
      }
    });
  }

  async createAuthUser(payload: { email: string }): Promise<auth_users> {
    return await this.prisma.auth_users.create({
      data: { primary_email: payload.email }
    });
  }

  async createAuthProvider(payload: {
    auth_user_id: string;
    provider: string;
    provider_user_id: string;
    email: string;
    display_name?: string;
    avatar_url?: string;
  }) {
    return await this.prisma.auth_providers.create({
      data: {
        auth_user_id: payload.auth_user_id,
        provider: payload.provider,
        provider_user_id: payload.provider_user_id,
        email: payload.email,
        display_name: payload.display_name,
        avatar_url: payload.avatar_url
      }
    });
  }

  async createAuthSession(
    auth_user_id: string,
    device_info: string,
    user_agent: string,
    ip_address: string,
    refresh_token: string
  ) {
    return await this.prisma.auth_sessions.create({
      data: {
        auth_user_id,
        device_info,
        user_agent,
        ip_address,
        refresh_token,
        expires_at: new Date(Date.now() + this.ttlMs)
      }
    });
  }

  get ttlMs() {
    const refreshTtl: string = this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN'
    ) as string;

    const ttlMs: number = ms(refreshTtl as StringValue);
    return ttlMs;
  }

  getToken(type: string, payload: PayloadToken): string {
    if (type === 'ACCESS') {
      return this.jwtService.sign(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN')
      });
    }
    if (type === 'REFRESH') {
      return this.jwtService.sign(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN')
      });
    }
    return '';
  }

  verifyToken(type: string, token: string): PayloadToken | null {
    if (type === 'ACCESS') {
      return this.jwtService.verify<PayloadToken>(token, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET')
      });
    }
    if (type === 'REFRESH') {
      return this.jwtService.verify<PayloadToken>(token, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET')
      });
    }
    return null;
  }

  async grantNewToken(refresh_token: string) {
    try {
      const payload: PayloadToken | null = this.verifyToken(
        'REFRESH',
        refresh_token
      );

      if (!payload) {
        throw new Error('Invalid refresh token');
      }
      const session = await this.prisma.auth_sessions.findFirst({
        where: {
          refresh_token
        }
      });
      if (!session) {
        throw new Error('Session not found');
      }
      if (session.is_revoked) {
        throw new Error('Token has been revoked');
      }
      if (session.expires_at <= new Date()) {
        throw new Error('Session expired');
      }

      const payloadToken: PayloadToken = {
        sub: payload.sub,
        role: payload.role,
        status: payload.status
      };

      const newAccessToken = this.getToken('ACCESS', payloadToken);

      return { accessToken: newAccessToken };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
      throw new HttpException(e.message, 403);
    }
  }
}
