import crypto from 'crypto';
import fs from 'fs';

const ALGORITHM = 'aes-256-gcm';
const JWT_SECRET = 'b9ae84ee4822d8f780c105009e4ed715'; // From .dev.vars

async function decryptToken(encrypted) {
  try {
    // 1. Text encode the secret string
    const secretBytes = Buffer.from(JWT_SECRET, 'utf8');
    // 2. SHA-256 digest of the secretBytes
    const key = crypto.createHash('sha256').update(secretBytes).digest();
    
    const parts = encrypted.split('.');
    if (parts.length !== 2) throw new Error('Invalid token format');

    const iv = Buffer.from(parts[0], 'base64');
    const cipherBuf = Buffer.from(parts[1], 'base64');
    
    // In WebCrypto AES-GCM, the auth tag is appended to the end of the cipher text
    const authTag = cipherBuf.slice(cipherBuf.length - 16);
    const encryptedText = cipherBuf.slice(0, cipherBuf.length - 16);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('Failed to decrypt token:', err);
    return null;
  }
}

async function run() {
  const enc = "tzEfOoHqEn8roHhf.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";
  const token = await decryptToken(enc);
  if (!token) return console.log("Failed to decrypt token");
  
  console.log("Token starts with:", token.substring(0, 10));
  
  const cleanId = '336748830345';
  const xmlReq = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${cleanId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
</GetItemRequest>`;

  const res = await fetch('https://api.ebay.com/ws/api.dll', {
    method: 'POST',
    headers: {
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
      'X-EBAY-API-CALL-NAME': 'GetItem',
      'X-EBAY-API-IAF-TOKEN': token,
      'Content-Type': 'text/xml'
    },
    body: xmlReq
  });

  const text = await res.text();
  fs.writeFileSync('debug_getitem.xml', text);
  console.log("Wrote GetItem response to debug_getitem.xml");
}

run();
