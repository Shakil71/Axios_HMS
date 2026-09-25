import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/http/all-exceptions.filter';
import { ResponseInterceptor } from './common/http/response';
import { getEnv } from './config/env';

/** Shared by main.ts and the integration tests so tests exercise the real pipeline. */
export function configureApp(app: INestApplication) {
  (app as NestExpressApplication).set('trust proxy', 1);
  app.setGlobalPrefix('api/v1');
  app.use(
    helmet({
      // API returns JSON only: lock everything down.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: new URL(getEnv().APP_URL).origin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
    maxAge: 600,
  });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  return app;
}
