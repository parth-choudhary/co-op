import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const secret = process.env.APP_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('APP_ENCRYPTION_KEY or NEXTAUTH_SECRET must be set for encryption');
  return scryptSync(secret, 'coop-v1-salt', 32);
}

function isEncrypted(value: string): boolean {
  return value.startsWith('enc:v1:');
}

export function encrypt(plaintext: string): string {
  if (!plaintext) return plaintext;
  if (isEncrypted(plaintext)) return plaintext;
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${Buffer.concat([iv, tag, enc]).toString('base64')}`;
}

export function decrypt(value: string): string {
  if (!value) return value;
  if (!isEncrypted(value)) return value; // legacy plaintext
  const blob = Buffer.from(value.slice('enc:v1:'.length), 'base64');
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export function tryDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  try { return decrypt(value); } catch { return null; }
}
