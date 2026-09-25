#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const functionsDir = path.join(projectRoot, 'functions');
const srcDir = path.join(projectRoot, 'src');

const FORBIDDEN_TOKENS = ['password_hash', 'security_answer_hash', 'token_version'];
const errors = [];

function checkFileForForbiddenResponseTokens(filePath) {
  const relPath = path.relative(projectRoot, filePath).replace(/\\/g, '/');
  const content = fs.readFileSync(filePath, 'utf8');

  // Check 1: In any file outside functions/utils/auth.js, check if password_hash or
  // security_answer_hash appears inside json(...) or Response constructions.
  const isAuthUtils = relPath === 'functions/utils/auth.js';

  // Find all json(...) or new Response(...) blocks
  // Regex to extract json(...) invocations
  const jsonRegex = /json\s*\(([\s\S]*?)\)(?:;|\s*,|\s*\))/g;
  let match;
  while ((match = jsonRegex.exec(content)) !== null) {
    const block = match[1];
    for (const token of ['password_hash', 'security_answer_hash']) {
      if (block.includes(token)) {
        errors.push(`[VIOLATION] Forbidden token "${token}" found inside json(...) in ${relPath}`);
      }
    }
  }

  // Regex to extract new Response(...) invocations
  const responseRegex = /new\s+Response\s*\(([\s\S]*?)\)/g;
  while ((match = responseRegex.exec(content)) !== null) {
    const block = match[1];
    for (const token of ['password_hash', 'security_answer_hash']) {
      if (block.includes(token)) {
        errors.push(`[VIOLATION] Forbidden token "${token}" found inside new Response(...) in ${relPath}`);
      }
    }
  }

  // Check 2: If file is functions/utils/auth.js, verify toPublicUser never includes forbidden fields
  if (isAuthUtils) {
    const toPublicUserMatch = content.match(/export function toPublicUser[\s\S]*?return\s*\{([\s\S]*?)\};/);
    if (!toPublicUserMatch) {
      errors.push(`[VIOLATION] toPublicUser function declaration not found in ${relPath}`);
    } else {
      const returnBody = toPublicUserMatch[1];
      for (const token of FORBIDDEN_TOKENS) {
        if (returnBody.includes(token)) {
          errors.push(`[VIOLATION] toPublicUser return body in ${relPath} contains forbidden token "${token}"`);
        }
      }
    }
  }

  // Check 3: Any route file returning a 'user' property in a response must use toPublicUser
  if (relPath.startsWith('functions/api/')) {
    const userPropertyRegex = /user\s*:\s*\{([^}]+)\}/g;
    while ((match = userPropertyRegex.exec(content)) !== null) {
      const inner = match[1];
      // Hand-crafted user objects containing user attributes (e.g. id, email, name) should use toPublicUser
      if (inner.includes('email') || inner.includes('name')) {
        errors.push(`[VIOLATION] Hand-crafted user object literal in ${relPath}. Responses must serialize users via toPublicUser(user). Found: ${match[0].replace(/\s+/g, ' ')}`);
      }
    }
  }
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.wrangler') {
        walkDir(fullPath);
      }
    } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.jsx'))) {
      checkFileForForbiddenResponseTokens(fullPath);
    }
  }
}

console.log('Running safe response serialization lint audit...');
walkDir(functionsDir);
walkDir(srcDir);

if (errors.length > 0) {
  console.error('\nSerialization Security Audit FAILED:');
  for (const err of errors) {
    console.error(' - ' + err);
  }
  process.exit(1);
} else {
  console.log('Serialization Security Audit PASSED: All user responses serialize through toPublicUser; zero credential tokens leaked.');
  process.exit(0);
}
