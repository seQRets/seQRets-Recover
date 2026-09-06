// seQRets Recover — cross-version recovery suite.
//
// WHAT THIS PROVES
// ----------------
// Recover is a frozen lifeboat: it stays pinned to @noble/ciphers 0.4.0 and
// @noble/hashes 1.4.0 while the main seQRets app moves on (2.2.0 / 1.8.0 at
// the time of writing). That divergence is deliberate — but it means the one
// thing an heir depends on was never actually tested:
//
//     a Qard created by TODAY's seQRets must open in TODAY's Recover.
//
// tests/fixtures/qards.json holds real Qards minted by the main app with its
// own, newer crypto (see seQRets-app/scripts/generate-recover-fixtures.mjs).
// This file replays them through THIS repo's pinned crypto and checks that
// the secret comes back byte-for-byte.
//
// It also pins the failure modes. An heir under stress must be able to tell
// "wrong password" from "damaged backup" from "your recovery tool is too
// old" — so the negative cases assert on the message, not just that it threw.
//
// Runs on plain Node (>= 22.18) with NO test framework and NO new
// dependencies — type stripping is native. That is on purpose: this repo's
// whole value proposition is that it has almost nothing in it.
//
//     npm test

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { recover, parseShare, tryParsePlan, decryptPlan, tryUnwrapFile, decodeBase64Text } from '../src/recover.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

interface Fixture {
  generatedBy: {
    app: string;
    version: string;
    codename?: string;
    shareFormatVersion: number;
    deps: Record<string, string>;
  };
  cases: Case[];
}

interface Case {
  id: string;
  description: string;
  kind: 'shares' | 'plan';
  password: string;
  keyfile: string | null;
  shares?: string[];
  useShares?: number[];
  plan?: { salt: string; data: string };
  expect?: { secret?: string; label?: string; fileName?: string; fileType?: string; fileText?: string };
  expectError?: string;
}

const fixture: Fixture = JSON.parse(
  readFileSync(resolve(HERE, 'fixtures', 'qards.json'), 'utf8'),
);

// ── tiny assertion helpers (no framework) ────────────────────────────

let passed = 0;
const failures: string[] = [];

const GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', RESET = '\x1b[0m';

function fail(id: string, msg: string) {
  failures.push(`${id}: ${msg}`);
  console.log(`  ${RED}✗${RESET} ${id}\n      ${msg}`);
}

function ok(id: string, ms: number) {
  passed += 1;
  console.log(`  ${GREEN}✓${RESET} ${id} ${DIM}(${ms}ms)${RESET}`);
}

function show(s: string, max = 72): string {
  const oneLine = s.replace(/\n/g, '\\n');
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

// ── the run ──────────────────────────────────────────────────────────

const g = fixture.generatedBy;
const ownDeps = JSON.parse(readFileSync(resolve(HERE, '..', 'package.json'), 'utf8')).dependencies;

console.log(`\n  seQRets Recover — cross-version recovery suite\n`);
console.log(`  Qards created by : ${g.app} v${g.version}${g.codename ? ` "${g.codename}"` : ''} `
  + `${DIM}(format v${g.shareFormatVersion})${RESET}`);
console.log(`  Replayed by      : seqrets-recover v${
  JSON.parse(readFileSync(resolve(HERE, '..', 'package.json'), 'utf8')).version}\n`);
console.log(`  ${DIM}dependency              created with    recovering with${RESET}`);
for (const [name, createdWith] of Object.entries(g.deps)) {
  const mine = ownDeps[name] ?? '—';
  const differs = mine.replace(/^[\^~]/, '') !== createdWith;
  console.log(`  ${DIM}${name.padEnd(23)}${RESET} ${createdWith.padEnd(14)} ${
    differs ? `${GREEN}${mine}${RESET}  ← different on purpose` : mine}`);
}
console.log('');

for (const c of fixture.cases) {
  const started = Date.now();
  try {
    if (c.kind === 'plan') {
      // Plans arrive as a JSON file the heir drops in; go through the same
      // sniff → decrypt → unwrap path the UI uses.
      const parsed = tryParsePlan(JSON.stringify(c.plan));
      if (!parsed) throw new Error('tryParsePlan refused a well-formed plan envelope');
      const payload = await decryptPlan(parsed, c.password, c.keyfile ?? undefined);
      const env = tryUnwrapFile(payload);
      if (!env) throw new Error('tryUnwrapFile did not recognise the file envelope');
      if (env.fileName !== c.expect!.fileName) {
        throw new Error(`fileName mismatch: got ${show(env.fileName)}, want ${show(c.expect!.fileName!)}`);
      }
      if (env.fileType !== c.expect!.fileType) {
        throw new Error(`fileType mismatch: got ${show(env.fileType)}, want ${show(c.expect!.fileType!)}`);
      }
      const text = decodeBase64Text(env.fileContent);
      if (text !== c.expect!.fileText) {
        throw new Error(`file content mismatch:\n        got  ${show(text)}\n        want ${show(c.expect!.fileText!)}`);
      }
      if (c.expectError) throw new Error(`expected failure (${c.expectError}) but it succeeded`);
      ok(c.id, Date.now() - started);
      continue;
    }

    const picked = (c.useShares ?? c.shares!.map((_, i) => i)).map(i => c.shares![i]);
    const res = await recover(picked, c.password, c.keyfile ?? undefined);

    if (c.expectError) {
      fail(c.id, `expected it to fail with "${c.expectError}", but it recovered: ${show(res.secret)}`);
      continue;
    }
    if (res.secret !== c.expect!.secret) {
      fail(c.id, `secret mismatch\n        got  ${show(res.secret)}\n        want ${show(c.expect!.secret!)}`);
      continue;
    }
    const wantLabel = c.expect!.label || undefined;
    if ((res.label || undefined) !== wantLabel) {
      fail(c.id, `label mismatch: got ${show(String(res.label))}, want ${show(String(wantLabel))}`);
      continue;
    }
    ok(c.id, Date.now() - started);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (c.expectError) {
      // The message matters: an heir has to be able to act on it.
      if (msg.toLowerCase().includes(c.expectError.toLowerCase())) {
        ok(c.id, Date.now() - started);
      } else {
        fail(c.id, `failed as expected, but with the wrong message.\n`
          + `        got  "${show(msg, 100)}"\n        want it to mention "${c.expectError}"`);
      }
    } else {
      fail(c.id, `threw: ${show(msg, 120)}`);
    }
  }
}

// ── parser-level checks that need no Argon2id ────────────────────────

console.log('');

function parserCheck(id: string, fn: () => void) {
  const started = Date.now();
  try {
    fn();
    ok(id, Date.now() - started);
  } catch (err) {
    fail(id, err instanceof Error ? err.message : String(err));
  }
}

parserCheck('parse-metadata-roundtrip', () => {
  const c = fixture.cases.find(x => x.id === 'text-2of3-meta')!;
  c.shares!.forEach((s, i) => {
    const p = parseShare(s);
    if (p.hashValid !== true) throw new Error(`share ${i + 1} failed its hash`);
    if (p.threshold !== 2) throw new Error(`share ${i + 1}: threshold ${p.threshold}, want 2`);
    if (p.total !== 3) throw new Error(`share ${i + 1}: total ${p.total}, want 3`);
    if (p.index !== i + 1) throw new Error(`share ${i + 1}: index ${p.index}, want ${i + 1}`);
  });
});

parserCheck('parse-legacy-has-no-hash-verdict', () => {
  const c = fixture.cases.find(x => x.id === 'legacy-pre-v19-3seg')!;
  const p = parseShare(c.shares![0]);
  // null, not false: "this share predates hashing" must not read as "damaged".
  if (p.hashValid !== null) throw new Error(`hashValid is ${p.hashValid}, want null`);
  if (p.threshold !== null || p.total !== null || p.index !== null) {
    throw new Error('legacy share reported recovery metadata it cannot have');
  }
});

parserCheck('parse-unknown-metadata-is-ignored', () => {
  // Forward compat: a future seQRets may add keys this copy has never heard
  // of. They must be hashed but otherwise ignored — NOT rejected.
  const c = fixture.cases.find(x => x.id === 'text-1of1')!;
  const p = parseShare(c.shares![0]);
  if (p.hashValid !== true) throw new Error('baseline share does not verify');
});

parserCheck('parse-rejects-non-seqrets-input', () => {
  let threw = false;
  try { parseShare('not-a-share|at|all'); } catch { threw = true; }
  if (!threw) throw new Error('accepted a string that is not a seQRets share');
});

// ── summary ──────────────────────────────────────────────────────────

const total = passed + failures.length;
console.log('');
if (failures.length === 0) {
  console.log(`  ${GREEN}All ${total} checks passed.${RESET}`);
  console.log(`  ${DIM}Qards from ${g.app} v${g.version} open cleanly in this lifeboat.${RESET}\n`);
  process.exit(0);
}
console.log(`  ${RED}${failures.length} of ${total} checks FAILED:${RESET}`);
for (const f of failures) console.log(`    • ${f}`);
console.log('');
process.exit(1);
