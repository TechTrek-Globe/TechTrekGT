/**
 * tokenCrypto.js - AES-GCM 256-bit encrypt/decrypt for eBay OAuth tokens
 *
 * Uses JWT_SECRET as key material (PBKDF2-SHA256, 100k iterations, fixed salt).
 */

const SALT = new TextEncoder().encode('techtrekgt-ebay-token-v1');
const PBKDF2_ITERATIONS = 100_000;

async function deriveKey(secret) {
  const raw = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
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
 * Encrypts a plain-text token string.
 * Returns a base64 string: "<iv_b64>.<ciphertext_b64>"
 */
export async function encryptToken(plaintext, jwtSecret) {
  const key = await deriveKey(jwtSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return `${bufToBase64(iv)}.${bufToBase64(cipherBuf)}`;
}

/**
 * Decrypts a token previously encrypted by encryptToken.
 * Returns the original plain-text string.
 */
export async function decryptToken(encrypted, jwtSecret) {
  const [ivB64, cipherB64] = encrypted.split('.');
  if (!ivB64 || !cipherB64) throw new Error('Invalid encrypted token format');
  const key = await deriveKey(jwtSecret);
  const iv = base64ToBuf(ivB64);
  const cipherBuf = base64ToBuf(cipherB64);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf);
  return new TextDecoder().decode(plainBuf);
}
