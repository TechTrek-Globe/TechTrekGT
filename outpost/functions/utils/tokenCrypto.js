/**
 * tokenCrypto.js - AES-GCM 256-bit encrypt/decrypt for eBay OAuth tokens
 *
 * Uses TOKEN_ENCRYPTION_KEY as key material (PBKDF2-SHA256, 100k iterations, dedicated salt).
 * Fallback support during migration window enables seamless transition from legacy JWT_SECRET.
 */

export const OLD_SALT = new TextEncoder().encode('techtrekgt-ebay-token-v1');
export const NEW_SALT = new TextEncoder().encode('techtrekgt-token-encryption-v2');
export const PBKDF2_ITERATIONS = 100_000;

export async function deriveKey(secret, salt = NEW_SALT) {
  const raw = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

/**
 * Encrypts a plain-text token string using TOKEN_ENCRYPTION_KEY.
 * Returns a base64 string: "<iv_b64>.<ciphertext_b64>"
 */
export async function encryptToken(plaintext, tokenEncryptionKey) {
  if (!tokenEncryptionKey) throw new Error('TOKEN_ENCRYPTION_KEY binding is required');
  const key = await deriveKey(tokenEncryptionKey, NEW_SALT);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return `${bufToBase64(iv)}.${bufToBase64(cipherBuf)}`;
}

/**
 * Decrypts a token previously encrypted by encryptToken.
 * Supports transition window: tries TOKEN_ENCRYPTION_KEY with NEW_SALT first,
 * falling back to legacy derivation (fallbackSecret || tokenEncryptionKey with OLD_SALT)
 * if necessary.
 *
 * Returns the original plain-text string.
 */
export async function decryptToken(encrypted, tokenEncryptionKey, fallbackSecret = null) {
  if (!encrypted) return null;
  const [ivB64, cipherB64] = encrypted.split('.');
  if (!ivB64 || !cipherB64) throw new Error('Invalid encrypted token format');
  const iv = base64ToBuf(ivB64);
  const cipherBuf = base64ToBuf(cipherB64);

  // 1. Try decrypting with primary TOKEN_ENCRYPTION_KEY and NEW_SALT
  if (tokenEncryptionKey) {
    try {
      const key = await deriveKey(tokenEncryptionKey, NEW_SALT);
      const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf);
      return new TextDecoder().decode(plainBuf);
    } catch (_) {
      // Transition fallback if ciphertext was encrypted with legacy derivation
    }
  }

  // 2. Transition window fallback: try legacy key derivation with OLD_SALT
  const oldSecret = fallbackSecret || tokenEncryptionKey;
  if (oldSecret) {
    try {
      const oldKey = await deriveKey(oldSecret, OLD_SALT);
      const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, oldKey, cipherBuf);
      return new TextDecoder().decode(plainBuf);
    } catch (_) {
      // Both attempts failed
    }
  }

  throw new Error('Failed to decrypt token: invalid key or ciphertext corrupted');
}

