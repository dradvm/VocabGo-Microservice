import {
  HttpException,
  Inject,
  Injectable,
  OnModuleInit
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ClientGrpc } from '@nestjs/microservices';
import {
  auth_providers,
  auth_sessions,
  auth_users,
  Prisma
} from '@prisma/client';
import { TokenPayload } from 'google-auth-library';
import { StringValue } from 'ms';
import * as ms from 'ms';
import { Observable } from 'rxjs';
import { PrismaService } from 'src/prisma/prisma.service';
import { PayloadToken } from 'src/types/payloadToken';
import { compareToken, hashToken } from 'src/utils/bcrypt';
interface UserService {
  createUser(data: {
    userId: string;
    avatarUrl: string;
    givenName: string;
    familyName: string;
    email: string;
  }): Observable<{ status: boolean }>;
}
@Injectable()
export class AuthService implements OnModuleInit {
  private userService: UserService;
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject('USER_GRPC_SERVICE') private userClientGrpc: ClientGrpc
  ) {}
  onModuleInit() {
    this.userService =
      this.userClientGrpc.getService<UserService>('UserService');
  }

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

  async createAuthUser(
    payload: { email: string },
    tokenPayload: TokenPayload
  ): Promise<auth_users> {
    const auth_user = await this.prisma.auth_users.create({
      data: { primary_email: payload.email, last_login_at: new Date() }
    });
    if (
      tokenPayload.picture &&
      tokenPayload.given_name &&
      tokenPayload.family_name &&
      tokenPayload.email
    ) {
      this.userService
        .createUser({
          userId: auth_user.id,
          avatarUrl: tokenPayload.picture,
          givenName: tokenPayload.given_name,
          familyName: tokenPayload.family_name,
          email: tokenPayload.email
        })
        .subscribe();
    }

    return auth_user;
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

      const user = await this.prisma.auth_users.findUnique({
        where: {
          id: session.auth_user_id
        }
      });

      if (!user) {
        throw new Error('User not found');
      }

      const payloadToken: PayloadToken = {
        sub: payload.sub,
        role: payload.role,
        status: user?.status ?? 'banned'
      };

      const newAccessToken = this.getToken('ACCESS', payloadToken);

      return { accessToken: newAccessToken };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      await this.logout(refresh_token);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
      throw new HttpException(e.message, 403);
    }
  }

  async createAdminAccount(username: string, password: string, email?: string) {
    // 1️⃣ Kiểm tra trùng username hoặc email
    const existingUser = await this.prisma.auth_users.findFirst({
      where: {
        OR: [{ username }, { primary_email: email ?? undefined }]
      }
    });

    if (existingUser) {
      throw new Error('Username hoặc email đã tồn tại');
    }

    // 2️⃣ Băm mật khẩu
    const passwordHash = await hashToken(password.toString());

    // 3️⃣ Tạo tài khoản admin
    const newAdmin = await this.prisma.auth_users.create({
      data: {
        username,
        primary_email: email || null,
        password_hash: passwordHash,
        role: 'admin',
        status: 'active'
      }
    });

    return newAdmin;
  }

  async loginAdmin(email: string, password: string) {
    const user = await this.prisma.auth_users.findUnique({
      where: { primary_email: email }
    });

    if (!user) {
      throw new HttpException('User not found', 404);
    }
    if (
      (await compareToken(password.toString(), user.password_hash!)) === false
    ) {
      throw new HttpException('Password not correct', 401);
    }
    if (user.role !== 'admin') {
      throw new HttpException('Access denied', 403);
    }
    if (user.status !== 'active') {
      throw new HttpException('User is not active', 403);
    }
    await this.prisma.auth_users.update({
      where: { id: user.id },
      data: { last_login_at: new Date() }
    });
    const payloadToken: PayloadToken = {
      sub: user.id,
      role: user.role,
      status: user.status
    };

    const newAccessToken = this.getToken('ACCESS', payloadToken);
    const newRefreshToken = this.getToken('REFRESH', payloadToken);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    };
  }

  async logout(refreshToken: string) {
    const session = await this.prisma.auth_sessions.findUnique({
      where: { refresh_token: refreshToken }
    });

    if (!session) return;

    await this.prisma.auth_sessions.updateMany({
      where: { auth_user_id: session.auth_user_id },
      data: {
        is_revoked: true
      }
    });
  }

  async getUsers(page: number = 0, limit: number = 10, search: string = '') {
    const skip = page * limit;

    // Điều kiện WHERE cho tìm kiếm
    const where = search
      ? {
          OR: [
            {
              primary_email: {
                contains: search,
                mode: Prisma.QueryMode.insensitive
              }
            }
          ]
        }
      : {};

    // Chạy song song lấy danh sách + tổng số
    const [data, total] = await Promise.all([
      this.prisma.auth_users.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' }, // Người mới đăng ký hiển thị trước
        select: {
          id: true,
          primary_email: true,
          role: true,
          status: true,
          last_login_at: true
        }
      }),
      this.prisma.auth_users.count({ where })
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async toggleStatus(userId: string) {
    const user = await this.prisma.auth_users.findUnique({
      where: {
        id: userId
      }
    });
    if (!user) {
      return null;
    }
    return this.prisma.auth_users.update({
      where: {
        id: userId
      },
      data: {
        status: user.status == 'active' ? 'banned' : 'active'
      }
    });
  }

  async getActiveUsers() {
    const users = await this.prisma.auth_users.findMany({
      where: {
        status: 'active',
        role: 'user'
      },
      select: {
        id: true
      }
    });
    return users.map((user) => user.id);
  }
}
