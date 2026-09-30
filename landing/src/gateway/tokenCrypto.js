/**
 * tokenCrypto.js - AES-GCM 256-bit encrypt/decrypt for eBay OAuth tokens (Landing Gateway)
 *
 * Ciphertext envelope versions:
 *   v1 (legacy): "<iv_b64>.<ciphertext_b64>"        - PBKDF2 100k iterations, OLD_SALT or NEW_SALT
 *   v2 (current): "v2.<iv_b64>.<ciphertext_b64>"    - PBKDF2 310k iterations, NEW_SALT
 *
 * TOKEN_ENCRYPTION_KEY is REQUIRED. No substitution for JWT_SECRET is ever permitted.
 *
 * FOLLOW-UP: Remove legacy v1/OLD_SALT decryption path once all stored tokens
 *            have been re-encrypted under v2. Scheduled: 2026-12-31.
 */

export const OLD_SALT = new TextEncoder().encode('techtrekgt-ebay-token-v1');
export const NEW_SALT = new TextEncoder().encode('techtrekgt-token-encryption-v2');

// v1 legacy iteration count - retained ONLY for decryption of existing stored tokens
export const PBKDF2_ITERATIONS_V1 = 100_000;
// v2 current iteration count - matches password hashing OWASP recommendation (310k)
export const PBKDF2_ITERATIONS_V2 = 310_000;
// Alias kept for callers that imported the original name
export const PBKDF2_ITERATIONS = PBKDF2_ITERATIONS_V2;

const V2_PREFIX = 'v2';

export async function deriveKey(secret, salt = NEW_SALT, iterations = PBKDF2_ITERATIONS_V2) {
  const raw = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
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
 * Returns a v2 versioned envelope: "v2.<iv_b64>.<ciphertext_b64>"
 *
 * TOKEN_ENCRYPTION_KEY is required. Throws if absent.
 */
export async function encryptToken(plaintext, tokenEncryptionKey) {
  if (!tokenEncryptionKey) throw new Error('TOKEN_ENCRYPTION_KEY binding is required');
  const key = await deriveKey(tokenEncryptionKey, NEW_SALT, PBKDF2_ITERATIONS_V2);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return `${V2_PREFIX}.${bufToBase64(iv)}.${bufToBase64(cipherBuf)}`;
}

/**
 * Decrypts a token previously encrypted by encryptToken.
 *
 * Version detection:
 *   - Starts with "v2." -> v2 envelope: TOKEN_ENCRYPTION_KEY + NEW_SALT + 310k iterations
 *   - Otherwise        -> v1 (legacy): try NEW_SALT+100k then OLD_SALT+100k
 *
 * Returns { plaintext, wasLegacy } where wasLegacy=true signals the caller to re-encrypt
 * under v2 and persist, draining the legacy path naturally.
 *
 * Throws a clear error on corrupted ciphertext - never returns null silently.
 * TOKEN_ENCRYPTION_KEY is required. No JWT_SECRET substitution is ever attempted.
 */
export async function decryptToken(encrypted, tokenEncryptionKey) {
  if (!encrypted) return { plaintext: null, wasLegacy: false };
  if (!tokenEncryptionKey) throw new Error('TOKEN_ENCRYPTION_KEY binding is required for decryption');

  // --- v2 path ---
  if (encrypted.startsWith(`${V2_PREFIX}.`)) {
    const rest = encrypted.slice(V2_PREFIX.length + 1);
    const dotIdx = rest.indexOf('.');
    if (dotIdx === -1) throw new Error('Invalid v2 encrypted token format');
    const iv = base64ToBuf(rest.slice(0, dotIdx));
    const cipherBuf = base64ToBuf(rest.slice(dotIdx + 1));
    const key = await deriveKey(tokenEncryptionKey, NEW_SALT, PBKDF2_ITERATIONS_V2);
    let plainBuf;
    try {
      plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf);
    } catch (_) {
      throw new Error('Failed to decrypt v2 token: invalid key or ciphertext corrupted');
    }
    return { plaintext: new TextDecoder().decode(plainBuf), wasLegacy: false };
  }

  // --- v1 (legacy) path ---
  const dotIdx = encrypted.indexOf('.');
  if (dotIdx === -1) throw new Error('Invalid encrypted token format');
  const iv = base64ToBuf(encrypted.slice(0, dotIdx));
  const cipherBuf = base64ToBuf(encrypted.slice(dotIdx + 1));

  // v1 attempt 1: TOKEN_ENCRYPTION_KEY + NEW_SALT + 100k iterations
  try {
    const key = await deriveKey(tokenEncryptionKey, NEW_SALT, PBKDF2_ITERATIONS_V1);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf);
    return { plaintext: new TextDecoder().decode(plainBuf), wasLegacy: true };
  } catch (_) {
    // fall through to OLD_SALT attempt
  }

  // v1 attempt 2: TOKEN_ENCRYPTION_KEY + OLD_SALT + 100k (oldest stored tokens)
  try {
    const key = await deriveKey(tokenEncryptionKey, OLD_SALT, PBKDF2_ITERATIONS_V1);
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf);
    return { plaintext: new TextDecoder().decode(plainBuf), wasLegacy: true };
  } catch (_) {
    // both v1 paths exhausted
  }

  throw new Error('Failed to decrypt token: invalid key or ciphertext corrupted');
}
