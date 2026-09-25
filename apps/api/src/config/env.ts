import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('true')
  .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  APP_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(14),

  // 32 random bytes, base64. Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  FIELD_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'FIELD_ENCRYPTION_KEY must be 32 bytes, base64'),
  FIELD_ENCRYPTION_KEY_ID: z.string().default('v1'),

  STORAGE_DRIVER: z.enum(['s3', 'memory']).default('s3'),
  S3_SSE: z.enum(['AES256', 'aws:kms', 'none']).default('AES256'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('hms-private-documents'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool,
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(120),
  UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('Axios Station Medical Care <no-reply@localhost>'),

  CAPTCHA_SECRET_KEY: z.string().optional(),

  RATE_LIMIT_ENABLED: bool,
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
      throw new Error(`Invalid environment configuration:\n  ${problems}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function resetEnvForTests() {
  cached = undefined;
}

export const isProd = () => getEnv().NODE_ENV === 'production';
