import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../common/prisma.service';
import { isDemo } from '../config/env';
import { DEMO_ACCOUNTS, DEMO_PASSWORD_DEFAULT } from '../demo/demo';
import { Public } from '../rbac/auth-user';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  live() {
    // In the demo environment the sign-in page shows these accounts. They never exist outside demo mode.
    return isDemo()
      ? { status: 'ok', demo: true, demoPassword: process.env.DEMO_PASSWORD ?? DEMO_PASSWORD_DEFAULT, demoAccounts: DEMO_ACCOUNTS.map(({ key, email, fullName, role, label, home }) => ({ key, email, fullName, role, label, home })) }
      : { status: 'ok', demo: false };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException('database unavailable');
    }
    return { status: 'ready' };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
