// WebCrypto Authentication & JWT helper utilities for Cloudflare Workers / D1
// Verbatim port from outpost/functions/utils/auth.js - shared SSO pattern.

export async function hashPassword(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, keyMaterial, 256);
  const hashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:310000:${hashHex}`;
}

export function isThreePartHash(storedHash) {
  if (typeof storedHash !== 'string') return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const [saltHex, iterStr, hashHex] = parts;
  const iterations = parseInt(iterStr, 10);
  return Boolean(saltHex && hashHex && Number.isInteger(iterations) && iterations >= 1);
}

export async function verifyPassword(password, storedHash) {
  if (!isThreePartHash(storedHash)) return false;
  const parts = storedHash.split(':');
  const [saltHex, iterStr, originalHashHex] = parts;
  const iterations = parseInt(iterStr, 10);
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, keyMaterial, 256);
  const hashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
  if (hashHex.length !== originalHashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < hashHex.length; i++) diff |= hashHex.charCodeAt(i) ^ originalHashHex.charCodeAt(i);
  return diff === 0;
}

function base64UrlEncode(str) {
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return atob(base64);
}

export async function createToken(payload, secret, expiresInSeconds = 7200) {
  if (!secret) throw new Error('JWT_SECRET is not defined');
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + expiresInSeconds }));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(dataToSign));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${dataToSign}.${encodedSignature}`;
}

export async function verifyToken(token, secret) {
  if (!secret || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const enc = new TextEncoder();
  try {
    const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const signatureBytes = new Uint8Array(atob(encodedSignature.replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => c.charCodeAt(0)));
    const isValid = await crypto.subtle.verify('HMAC', cryptoKey, signatureBytes, enc.encode(dataToSign));
    if (!isValid) return null;
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

export function buildAuthCookie(token, maxAge) {
  return [`auth_token=${token}`, 'HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', `Max-Age=${maxAge}`].join('; ');
}

export function getTokenFromRequest(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
  if (match && match[1]) return match[1];
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (token && token !== 'cookie-active' && token !== 'null' && token !== 'undefined') return token;
  }
  return null;
}
