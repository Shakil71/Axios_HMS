import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Controller, ForbiddenException, Get, Global, HttpCode, Module, NotFoundException, Put, Req, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../rbac/auth-user';
import { createHmac, timingSafeEqual } from 'crypto';
import { getEnv } from '../config/env';

export interface PresignedUpload {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: Date;
}

/** Private object storage. Implementations must never expose objects publicly. */
export abstract class Storage {
  abstract presignPut(key: string, opts: { contentType: string; contentLength: number; ttlSeconds: number }): Promise<PresignedUpload>;
  abstract presignGet(key: string, opts: { ttlSeconds: number; fileName: string; contentType: string; inline: boolean }): Promise<string>;
  /** Whole object (bounded by UPLOAD_MAX_BYTES) or null if absent. */
  abstract read(key: string): Promise<Buffer | null>;
  abstract remove(key: string): Promise<void>;
}

const contentDisposition = (fileName: string, inline: boolean) =>
  `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName).replace(/['()]/g, escape)}`;

export class S3Storage extends Storage {
  private readonly client: S3Client;
  private readonly bucket = getEnv().S3_BUCKET;

  constructor() {
    super();
    const env = getEnv();
    this.client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: env.S3_ACCESS_KEY && env.S3_SECRET_KEY ? { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY } : undefined,
    });
  }

  private sse() {
    const v = getEnv().S3_SSE;
    return v === 'none' ? undefined : v;
  }

  async presignPut(key: string, o: { contentType: string; contentLength: number; ttlSeconds: number }): Promise<PresignedUpload> {
    const sse = this.sse();
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: o.contentType, ContentLength: o.contentLength, ServerSideEncryption: sse });
    const url = await getSignedUrl(this.client, command, { expiresIn: o.ttlSeconds, signableHeaders: new Set(['content-type', 'content-length']) });
    return {
      url,
      method: 'PUT',
      headers: { 'Content-Type': o.contentType, ...(sse ? { 'x-amz-server-side-encryption': sse } : {}) },
      expiresAt: new Date(Date.now() + o.ttlSeconds * 1000),
    };
  }

  presignGet(key: string, o: { ttlSeconds: number; fileName: string; contentType: string; inline: boolean }) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: o.contentType,
      ResponseContentDisposition: contentDisposition(o.fileName, o.inline),
      ResponseCacheControl: 'private, no-store',
    });
    return getSignedUrl(this.client, command, { expiresIn: o.ttlSeconds });
  }

  async read(key: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await res.Body!.transformToByteArray();
      return Buffer.from(bytes);
    } catch (e) {
      if ((e as { name?: string }).name === 'NoSuchKey') return null;
      throw e;
    }
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/**
 * Test/dev driver: in-memory objects behind HMAC-signed, expiring URLs that mirror real presigning
 * semantics. URLs point at DevStorageController (`/_dev/storage/...`), which only exists when this
 * driver is active and is refused in production.
 */
export class MemoryStorage extends Storage {
  readonly objects = new Map<string, Buffer>();
  readonly meta = new Map<string, { contentType: string }>();
  private readonly secret = getEnv().JWT_SECRET;
  static readonly PREFIX = '/api/v1/_dev/storage';

  sign(kind: string, key: string, exp: number, extra = '') {
    return createHmac('sha256', this.secret).update(`${kind}|${key}|${exp}|${extra}`).digest('hex');
  }

  private url(kind: 'put' | 'get', key: string, ttlSeconds: number, extra: Record<string, string> = {}) {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const extraStr = new URLSearchParams(extra).toString();
    const q = new URLSearchParams({ exp: String(exp), sig: this.sign(kind, key, exp, extraStr), ...extra });
    return `${MemoryStorage.PREFIX}/${kind}/${key}?${q.toString()}`;
  }

  async presignPut(key: string, o: { contentType: string; contentLength: number; ttlSeconds: number }): Promise<PresignedUpload> {
    return {
      url: this.url('put', key, o.ttlSeconds, { ct: o.contentType, len: String(o.contentLength) }),
      method: 'PUT',
      headers: { 'Content-Type': o.contentType },
      expiresAt: new Date(Date.now() + o.ttlSeconds * 1000),
    };
  }

  async presignGet(key: string, o: { ttlSeconds: number; fileName: string; contentType: string; inline: boolean }) {
    return this.url('get', key, o.ttlSeconds, { ct: o.contentType, fn: o.fileName, inline: o.inline ? '1' : '0' });
  }

  /** Validates signature + expiry the way a real storage server would; returns the parsed parameters. */
  verify(kind: 'put' | 'get', rawUrl: string) {
    const u = new URL(rawUrl, 'http://storage.local');
    const key = decodeURIComponent(u.pathname.slice(`${MemoryStorage.PREFIX}/${kind}/`.length));
    const exp = Number(u.searchParams.get('exp'));
    const sig = u.searchParams.get('sig') ?? '';
    const extra = new URLSearchParams(Object.fromEntries([...u.searchParams].filter(([k]) => !['exp', 'sig'].includes(k)))).toString();
    const expected = this.sign(kind, key, exp, extra);
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error('SignatureDoesNotMatch');
    if (!(exp >= Date.now() / 1000)) throw new Error('ExpiredToken');
    return { key, params: u.searchParams };
  }

  /** Simulates fetching a presigned GET URL (used by tests). */
  fetchSigned(url: string): Buffer {
    const { key } = this.verify('get', url);
    const obj = this.objects.get(key);
    if (!obj) throw new Error('NoSuchKey');
    return obj;
  }

  async read(key: string) {
    return this.objects.get(key) ?? null;
  }

  async remove(key: string) {
    this.objects.delete(key);
    this.meta.delete(key);
  }
}

/** Dev/test only: stands in for the S3 endpoint that presigned URLs point to. Not registered with the S3 driver. */
@Public()
@SkipThrottle()
@Controller('_dev/storage')
export class DevStorageController {
  constructor(private readonly storage: Storage) {}

  private get mem() {
    if (!(this.storage instanceof MemoryStorage) || (getEnv().NODE_ENV === 'production' && !getEnv().DEMO_MODE)) throw new NotFoundException();
    return this.storage;
  }

  private verified(mem: MemoryStorage, kind: 'put' | 'get', url: string) {
    try {
      return mem.verify(kind, url);
    } catch {
      throw new ForbiddenException('Invalid or expired link');
    }
  }

  @Put('put/*key')
  @HttpCode(200)
  async put(@Req() req: Request, @Res() res: Response) {
    const mem = this.mem;
    const { key, params } = this.verified(mem, 'put', req.originalUrl);
    const expected = Number(params.get('len'));
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > expected) return void res.status(413).end();
      chunks.push(chunk as Buffer);
    }
    if (size !== expected) return void res.status(400).end();
    mem.objects.set(key, Buffer.concat(chunks));
    mem.meta.set(key, { contentType: params.get('ct') ?? 'application/octet-stream' });
    res.status(200).end();
  }

  @Get('get/*key')
  async get(@Req() req: Request, @Res() res: Response) {
    const mem = this.mem;
    const { key, params } = this.verified(mem, 'get', req.originalUrl);
    const bytes = mem.objects.get(key);
    if (!bytes) return void res.status(404).end();
    const fileName = params.get('fn') ?? 'file';
    res.setHeader('Content-Type', params.get('ct') ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', contentDisposition(fileName, params.get('inline') === '1'));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(bytes);
  }
}

@Global()
@Module({
  controllers: getEnv().STORAGE_DRIVER === 'memory' && (getEnv().NODE_ENV !== 'production' || getEnv().DEMO_MODE) ? [DevStorageController] : [],
  providers: [
    {
      provide: Storage,
      useFactory: () => {
        const env = getEnv();
        if (env.STORAGE_DRIVER === 'memory') {
          if (env.NODE_ENV === 'production' && !env.DEMO_MODE) throw new Error('STORAGE_DRIVER=memory is not allowed in production');
          return new MemoryStorage();
        }
        return new S3Storage();
      },
    },
  ],
  exports: [Storage],
})
export class StorageModule {}
