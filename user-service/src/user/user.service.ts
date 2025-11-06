import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ClaimKPRequest, CreateUserRequest } from 'src/dto/user.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('PROGRESS_PUBLISHER') private progressClient: ClientProxy
  ) {}

  async generatePublicId(given_name: string) {
    // Bỏ dấu tiếng Việt và khoảng trắng
    const normalizedName = given_name
      .normalize('NFD') // Tách dấu
      .replace(/[\u0300-\u036f]/g, '') // Xoá dấu
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/\s+/g, ''); // Xoá khoảng trắng

    let publicId = '';
    for (let i = 0; i < 10; i++) {
      const code = Math.floor(Math.random() * 1000000)
        .toString()
        .padStart(6, '0');
      publicId = normalizedName + code;

      const existing = await this.prisma.user_profile.findUnique({
        where: { public_id: publicId }
      });

      if (!existing) break;
    }

    return publicId;
  }

  async createUser(data: CreateUserRequest) {
    try {
      const [userProfile, userWallet] = await this.prisma.$transaction([
        this.prisma.user_profile.create({
          data: {
            user_id: data.userId,
            public_id: await this.generatePublicId(data.givenName),
            given_name: data.givenName,
            family_name: data.familyName,
            email: data.email
          }
        }),
        this.prisma.user_wallet.create({
          data: {
            user_id: data.userId,
            rubys: 0,
            kp_points: 0,
            energy: 10
          }
        })
      ]);
      this.progressClient.emit('user_created', {
        userId: userProfile.user_id
      });
      return true;
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      console.log(error.message);
      return false;
    }
  }
  async claimKP(data: ClaimKPRequest) {
    return this.prisma.user_wallet.update({
      where: {
        user_id: data.userId
      },
      data: {
        kp_points: {
          increment: data.kp
        }
      }
    });
  }

  async getWallet(userId: string) {
    const userStatus = await this.recoverEnergy(userId);

    return {
      ruby: userStatus?.rubys ?? 0,
      energy: {
        current: userStatus?.energy ?? 0,
        max: 10,
        regenTime: 1200000,
        lastRegen: userStatus?.energy_last_updated ?? new Date()
      }
    };
  }

  async onLessonStarted(userId: string) {
    let amount = 1;
    const user_wallet = await this.prisma.user_wallet.findUnique({
      where: {
        user_id: userId
      }
    });
    if (!user_wallet || (user_wallet.energy ?? 0) < 1) {
      amount = 0;
    }

    return this.prisma.user_wallet.update({
      where: {
        user_id: userId
      },
      data: {
        energy: {
          decrement: amount
        },
        energy_last_updated: new Date()
      }
    });
  }

  async recoverEnergy(userId: string) {
    const userWallet = await this.prisma.user_wallet.findUnique({
      where: { user_id: userId }
    });

    if (!userWallet) return null;

    const now = new Date();
    const recoveryInterval = 20 * 60 * 1000; // 20 phút (1200000 ms)
    const maxEnergy = 10;

    const { energy, energy_last_updated } = userWallet;

    // Nếu đã đầy thì không cần hồi

    if (energy == null || energy_last_updated == null) {
      return userWallet;
    }

    if (energy >= maxEnergy) {
      return userWallet;
    }

    const diff = now.getTime() - energy_last_updated.getTime();
    const recovered = Math.floor(diff / recoveryInterval);

    // Chưa đủ thời gian hồi thêm
    if (recovered <= 0) {
      return userWallet;
    }

    const newEnergy = Math.min(energy + recovered, maxEnergy);

    // Nếu hồi đầy thì đặt lại lastUpdated = now
    // Nếu chưa đầy thì tính mốc hồi kế tiếp
    const newLastUpdated =
      newEnergy === maxEnergy
        ? now
        : new Date(
            energy_last_updated.getTime() + recovered * recoveryInterval
          );

    // Cập nhật DB
    const updated = await this.prisma.user_wallet.update({
      where: { user_id: userId },
      data: {
        energy: newEnergy,
        energy_last_updated: newLastUpdated
      }
    });

    return updated;
  }
  async checkEnergy(userId: string) {
    const userWallet = await this.recoverEnergy(userId);
    return {
      hasEnergy: (userWallet?.energy ?? 0) > 0
    };
  }

  async getProfile(userId: string) {
    return {
      userProfile: await this.prisma.user_profile.findUnique({
        where: { user_id: userId }
      }),
      userWallet: await this.prisma.user_wallet.findUnique({
        where: { user_id: userId }
      })
    };
  }
}
