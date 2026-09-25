import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { isDemo } from '../config/env';
import { demoDatabase } from '../demo/demo-db';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // The adapter package pins an older @prisma/driver-adapter-utils, so the types differ while the runtime contract is identical.
    super(isDemo() ? ({ adapter: demoDatabase().adapter } as never) : undefined);
  }
  async onModuleInit() {
    if (isDemo()) await demoDatabase().ready;
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
