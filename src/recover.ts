// seQRets Recover — minimal reference implementation of the seQRets recovery path.
//
// Share format (plaintext, self-describing):
//   seQRets|<base64 salt>|<base64 nonce+ciphertext>|sha256:<hex>
//
// The 4th segment is optional for backward compatibility with pre-v1.6 shares.
//
// Pipeline on recovery:
//   shares → parse → combine (Shamir GF(256)) → split nonce(24)|ciphertext
//          → deriveKey(password, salt, [keyfile]) via Argon2id
//          → XChaCha20-Poly1305 decrypt
//          → gunzip
//          → JSON.parse { secret, label, isMnemonic?, mnemonicLengths? }
//          → if isMnemonic: reassemble BIP-39 phrases from concatenated entropy
//
// All primitives are MIT-licensed and widely reimplemented. This file exists
// to prove the format is not proprietary and can be recovered without the
// main seQRets app.

import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { argon2id } from '@noble/hashes/argon2';
import { sha256 } from '@noble/hashes/sha256';
import { concatBytes } from '@noble/hashes/utils';
import { combine } from 'shamir-secret-sharing';
import { ungzip } from 'pako';
import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { Buffer } from 'buffer';

const NONCE_LENGTH = 24;
const ARGON2 = { m: 65536, t: 4, p: 1, dkLen: 32 } as const;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface ParsedShare {
  salt: string;
  data: string;
  hashValid: boolean | null;
}

export interface RecoveryResult {
  secret: string;
  label?: string;
}

export type Progress = (stage: string) => void;

function b64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function parseShare(shareString: string): ParsedShare {
  const parts = shareString.trim().split('|');
  if (parts[0] !== 'seQRets') {
    throw new Error('This does not look like a seQRets share. A valid share starts with "seQRets|".');
  }

  if (parts.length === 4 && parts[3].startsWith('sha256:')) {
    const core = parts.slice(0, 3).join('|');
    const embedded = parts[3].slice('sha256:'.length);
    const computed = bytesToHex(sha256(textEncoder.encode(core)));
    return { salt: parts[1], data: parts[2], hashValid: embedded === computed };
  }

  if (parts.length === 3) {
    // Pre-fingerprint share (backward compat)
    return { salt: parts[1], data: parts[2], hashValid: null };
  }

  throw new Error('Share format is invalid or corrupted.');
}

export async function recover(
  shares: string[],
  password: string,
  keyfileB64?: string,
  onProgress: Progress = () => {},
): Promise<RecoveryResult> {
  if (!shares.length) throw new Error('Please add at least one share.');
  if (!password) throw new Error('Please enter your password.');

  onProgress('Checking shares');

  let saltB64: string | null = null;
  const encryptedShares: Uint8Array[] = [];

  for (const share of shares) {
    const parsed = parseShare(share);
    if (parsed.hashValid === false) {
      throw new Error('One of the shares failed its integrity check — it may be corrupted or mistyped.');
    }
    if (saltB64 === null) {
      saltB64 = parsed.salt;
    } else if (saltB64 !== parsed.salt) {
      throw new Error('These shares are from different secrets — their salts do not match.');
    }
    encryptedShares.push(b64ToBytes(parsed.data));
  }

  if (saltB64 === null) throw new Error('Could not read salt from shares.');

  onProgress('Combining shares');

  const combined = encryptedShares.length === 1
    ? encryptedShares[0]
    : await combine(encryptedShares);

  onProgress('Deriving key (this is the slow step — about 10–30 seconds)');

  const salt = b64ToBytes(saltB64);
  const passwordBytes = textEncoder.encode(password);
  const keyfileBytes = keyfileB64 ? b64ToBytes(keyfileB64) : undefined;
  const keyInput = keyfileBytes ? concatBytes(passwordBytes, keyfileBytes) : passwordBytes;

  let derivedKey: Uint8Array;
  try {
    derivedKey = await argon2id(keyInput, salt, ARGON2);
  } finally {
    passwordBytes.fill(0);
    if (keyfileBytes) keyInput.fill(0);
  }

  onProgress('Decrypting');

  let decryptedCompressed: Uint8Array;
  try {
    const nonce = combined.slice(0, NONCE_LENGTH);
    const ciphertext = combined.slice(NONCE_LENGTH);
    try {
      decryptedCompressed = xchacha20poly1305(derivedKey, nonce).decrypt(ciphertext);
    } catch {
      throw new Error('We could not decrypt with that password. Please check for typos — capitalization and spaces matter.');
    }
  } finally {
    derivedKey.fill(0);
  }

  onProgress('Expanding');

  let decompressed: Uint8Array;
  try {
    decompressed = ungzip(decryptedCompressed);
  } catch {
    throw new Error('The decrypted data is not readable. The shares or password may have been tampered with.');
  } finally {
    decryptedCompressed.fill(0);
  }

  const payload = JSON.parse(textDecoder.decode(decompressed));
  decompressed.fill(0);

  let finalSecret: string = payload.secret;

  if (payload.isMnemonic && Array.isArray(payload.mnemonicLengths)) {
    const wordCountToBytes: Record<number, number> = { 12: 16, 15: 20, 18: 24, 21: 28, 24: 32 };
    const entropy = b64ToBytes(payload.secret);
    const phrases: string[] = [];
    let idx = 0;
    for (const wordCount of payload.mnemonicLengths) {
      const len = wordCountToBytes[wordCount];
      if (!len || idx + len > entropy.length) {
        throw new Error('The mnemonic metadata does not match the entropy. The data may be corrupted.');
      }
      phrases.push(entropyToMnemonic(entropy.slice(idx, idx + len), wordlist));
      idx += len;
    }
    if (idx !== entropy.length) {
      throw new Error('Entropy length does not match the mnemonic lengths. The data may be corrupted.');
    }
    finalSecret = phrases.join('\n\n');
  }

  onProgress('Done');

  return {
    secret: finalSecret,
    label: payload.label || undefined,
  };
}

// Parse free-text input into individual share strings.
// Accepts shares separated by newlines, or multiple shares on one line separated by whitespace.
// Filters out empty lines and returns only strings that look like seQRets shares.
export function extractShares(text: string): string[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const shares: string[] = [];
  for (const line of lines) {
    if (line.startsWith('seQRets|')) {
      shares.push(line);
    }
  }
  return shares;
}

// ── Inheritance plan decryption ─────────────────────────────────────
//
// An encrypted inheritance plan is a JSON file with the shape { salt, data }.
// The pipeline is identical to share recovery except there is no Shamir step —
// the ciphertext is a single blob rather than multiple pieces to combine.
//
//   JSON { salt, data }
//     → deriveKey(password [+keyfile]) via Argon2id
//     → XChaCha20-Poly1305 decrypt (nonce = data[0..24])
//     → gunzip
//     → JSON.parse
//
// Returns the decrypted payload as-is. No schema interpretation — the lifeboat
// deliberately shows raw JSON so that plan schema changes in the main app
// never break recovery.

export interface EncryptedPlan {
  salt: string;
  data: string;
}

export function tryParsePlan(text: string): EncryptedPlan | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const obj = JSON.parse(trimmed);
    if (
      obj && typeof obj === 'object'
      && typeof obj.salt === 'string'
      && typeof obj.data === 'string'
    ) {
      return { salt: obj.salt, data: obj.data };
    }
  } catch {
    // not JSON — fall through
  }
  return null;
}

export async function decryptPlan(
  payload: EncryptedPlan,
  password: string,
  keyfileB64?: string,
  onProgress: Progress = () => {},
): Promise<unknown> {
  if (!password) throw new Error('Please enter your password.');

  onProgress('Deriving key (this is the slow step — about 10–30 seconds)');

  const salt = b64ToBytes(payload.salt);
  const passwordBytes = textEncoder.encode(password);
  const keyfileBytes = keyfileB64 ? b64ToBytes(keyfileB64) : undefined;
  const keyInput = keyfileBytes ? concatBytes(passwordBytes, keyfileBytes) : passwordBytes;

  let derivedKey: Uint8Array;
  try {
    derivedKey = await argon2id(keyInput, salt, ARGON2);
  } finally {
    passwordBytes.fill(0);
    if (keyfileBytes) keyInput.fill(0);
  }

  onProgress('Decrypting');

  let decryptedCompressed: Uint8Array;
  try {
    const combined = b64ToBytes(payload.data);
    const nonce = combined.slice(0, NONCE_LENGTH);
    const ciphertext = combined.slice(NONCE_LENGTH);
    try {
      decryptedCompressed = xchacha20poly1305(derivedKey, nonce).decrypt(ciphertext);
    } catch {
      throw new Error('We could not decrypt with that password. Please check for typos — capitalization and spaces matter.');
    }
  } finally {
    derivedKey.fill(0);
  }

  onProgress('Expanding');

  let decompressed: Uint8Array;
  try {
    decompressed = ungzip(decryptedCompressed);
  } catch {
    throw new Error('The decrypted data is not readable. The password or keyfile may be wrong.');
  } finally {
    decryptedCompressed.fill(0);
  }

  const jsonStr = textDecoder.decode(decompressed);
  decompressed.fill(0);

  try {
    return JSON.parse(jsonStr);
  } catch {
    throw new Error('The decrypted payload is not valid JSON. The file may be damaged.');
  }
}
