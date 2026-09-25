import { Global, Injectable, Module } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { getEnv } from '../../config/env';

/** AES-256-GCM field encryption for NID/passport numbers, plus token helpers. */
@Injectable()
export class CryptoService {
  private key(): Buffer {
    return Buffer.from(getEnv().FIELD_ENCRYPTION_KEY, 'base64');
  }

  encryptField(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [getEnv().FIELD_ENCRYPTION_KEY_ID, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
  }

  decryptField(payload: string): string {
    const [, iv, tag, ct] = payload.split(':');
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64')), decipher.final()]).toString('utf8');
  }

  /** Returns "••••1234" — the only form of an identity number that leaves the API by default. */
  maskField(payload: string | null | undefined): string | null {
    if (!payload) return null;
    const plain = this.decryptField(payload);
    return `••••${plain.slice(-4)}`;
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }
}

@Global()
@Module({ providers: [CryptoService], exports: [CryptoService] })
export class CryptoModule {}
