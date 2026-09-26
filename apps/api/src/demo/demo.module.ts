import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { isDemo } from '../config/env';
import { syncRbac } from '../rbac/rbac-seed';
import { MemoryStorage, Storage } from '../storage/storage.service';
import { seedDemoWorld } from './demo';
import { demoDatabase, snapshotObjects } from './demo-db';

/** Demo mode only: fills the in-memory database with roles, demo accounts and sample data when the API starts. */
@Injectable()
export class DemoBootstrap implements OnModuleInit {
  private readonly logger = new Logger('Demo');
  constructor(private readonly prisma: PrismaService, private readonly storage: Storage) {}

  async onModuleInit() {
    if (!isDemo()) return;
    const started = Date.now();
    const mem = this.storage instanceof MemoryStorage ? this.storage : undefined;
    if (demoDatabase().fromSnapshot) {
      for (const [key, bytes] of snapshotObjects() ?? []) mem?.objects.set(key, bytes);
      this.logger.log(`Demo snapshot loaded in ${Date.now() - started} ms`);
      return;
    }
    await syncRbac(this.prisma);
    await seedDemoWorld(this.prisma, { putObject: mem ? (key, bytes) => mem.objects.set(key, bytes) : undefined });
    this.logger.log(`Demo data ready in ${Date.now() - started} ms`);
  }
}

@Module({ providers: [DemoBootstrap] })
export class DemoModule {}
