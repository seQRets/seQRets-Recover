// Creates an encrypted inheritance plan wrapping a markdown file,
// matching the format produced by the main seQRets app. Used for
// smoke-testing the file-envelope unwrap path in Recover.

import { argon2id } from '@noble/hashes/argon2';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { gzipSync } from 'fflate';
import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PASSWORD = 'test-password-123';
const MD = `# Test Plan\n\nThis is a **markdown** file encrypted as an inheritance plan.\n`;

const envelope = {
  fileName: 'test-plan.md',
  fileContent: Buffer.from(MD, 'utf8').toString('base64'),
  fileType: 'text/markdown',
};

const plaintext = gzipSync(new TextEncoder().encode(JSON.stringify(envelope)));
const salt = new Uint8Array(randomBytes(16));
const nonce = new Uint8Array(randomBytes(24));
const key = await argon2id(
  new TextEncoder().encode(PASSWORD),
  salt,
  { m: 65536, t: 4, p: 1, dkLen: 32 },
);
const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext);

const combined = new Uint8Array(nonce.length + ciphertext.length);
combined.set(nonce, 0);
combined.set(ciphertext, nonce.length);

const out = {
  salt: Buffer.from(salt).toString('base64'),
  data: Buffer.from(combined).toString('base64'),
};

// Write to a project-local path rather than /tmp. /tmp is a world-writable
// shared directory where predictable filenames are vulnerable to symlink
// attacks from other local users (CodeQL js/insecure-temporary-file). A
// path inside this repo's scripts/ directory is owned by the developer and
// cannot be pre-created by an attacker.
const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(here, 'test-plan.json');
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote ${outPath} — password: ${PASSWORD}`);
