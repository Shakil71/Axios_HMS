import 'reflect-metadata';
import './config/vercel-env';
// Nest loads its HTTP adapter with a dynamic require, which Vercel's file tracer cannot see: import it explicitly.
import '@nestjs/platform-express';
import type { IncomingMessage, ServerResponse } from 'http';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let ready: Promise<Handler> | undefined;

/** Builds the Nest app once per warm serverless instance and returns its Express handler. */
async function bootstrap(): Promise<Handler> {
  // Loaded lazily so a configuration error (missing env var) is caught and reported instead of crashing the module load.
  const { NestFactory } = require('@nestjs/core') as typeof import('@nestjs/core');
  const { Logger } = require('nestjs-pino') as typeof import('nestjs-pino');
  // require() (not import()) so the module system stays CommonJS and Vercel's file tracer follows it, as before.
  const { AppModule } = require('./app.module') as typeof import('./app.module');
  const { configureApp } = require('./app.setup') as typeof import('./app.setup');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  await app.init();
  return app.getHttpAdapter().getInstance() as Handler;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    ready ??= bootstrap();
    (await ready)(req, res);
  } catch (e) {
    ready = undefined; // retry on the next request
    // Env validation messages list variable names only, never values.
    const reason = (e instanceof Error ? e.message : 'unknown error').slice(0, 300);
    console.error('API failed to start:', reason);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: { code: 'NOT_CONFIGURED', message: 'The service is not configured correctly. Please try again later.', ...(process.env.DEMO_MODE === 'true' ? { detail: reason } : {}) } }));
  }
}
