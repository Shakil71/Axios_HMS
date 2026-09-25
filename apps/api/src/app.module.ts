import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import { LoggerModule } from 'nestjs-pino';
import { AuditModule } from './audit/audit.service';
import { AuthModule } from './auth/auth.controller';
import { CryptoModule } from './common/crypto/crypto.service';
import { PrismaModule } from './common/prisma.service';
import { getEnv } from './config/env';
import { HealthModule } from './health/health.controller';
import { MailModule } from './mail/mail.service';
import { CasesModule } from './cases/cases.controller';
import { DocumentsModule } from './documents/documents.controller';
import { DirectoryAdminModule } from './directory/directory.admin';
import { DirectoryPublicModule } from './directory/directory.public';
import { PatientsModule } from './patients/patients.controller';
import { AuthGuard, PermissionsGuard } from './rbac/guards';
import { StorageModule } from './storage/storage.service';
import { RbacModule } from './rbac/scope.service';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: getEnv().NODE_ENV === 'test' ? 'silent' : 'info',
        genReqId: (req) => (req.headers['x-request-id'] as string) || randomUUID(),
        // Never log credentials, cookies, bodies or query strings (they may carry tokens/PII).
        redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        serializers: {
          req: (req) => ({ id: req.id, method: req.method, url: String(req.url).split('?')[0] }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
      },
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }],
      skipIf: () => !getEnv().RATE_LIMIT_ENABLED,
    }),
    PrismaModule,
    CryptoModule,
    AuditModule,
    RbacModule,
    MailModule,
    HealthModule,
    StorageModule,
    AuthModule,
    DirectoryPublicModule,
    DirectoryAdminModule,
    PatientsModule,
    CasesModule,
    DocumentsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
