import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

interface EncryptedPayload {
  iv: string;
  tag: string;
  value: string;
}

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer | null;

  constructor(private readonly configService: ConfigService) {
    const secret =
      this.configService.get<string>('GOOGLE_OAUTH_ENCRYPTION_KEY') ??
      this.configService.get<string>('ENCRYPTION_SECRET');

    if (!secret) {
      this.logger.warn(
        'Sin GOOGLE_OAUTH_ENCRYPTION_KEY/ENCRYPTION_SECRET. Los tokens se guardarán en texto plano.',
      );
      this.key = null;
    } else {
      this.key = createHash('sha256').update(secret).digest();
    }
  }

  encrypt<T extends Record<string, unknown>>(payload: T): EncryptedPayload | T {
    if (!this.key) {
      return payload;
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const serialized = JSON.stringify(payload);
    const encrypted = Buffer.concat([
      cipher.update(serialized, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return {
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      value: encrypted.toString('base64'),
    };
  }

  decrypt<T = Record<string, unknown>>(payload: unknown): T {
    if (!this.key || !this.isEncryptedPayload(payload)) {
      return (payload ?? {}) as T;
    }

    const iv = Buffer.from(payload.iv, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.value, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8')) as T;
  }

  private isEncryptedPayload(value: unknown): value is EncryptedPayload {
    return (
      typeof value === 'object' &&
      value !== null &&
      'iv' in value &&
      'tag' in value &&
      'value' in value
    );
  }
}
