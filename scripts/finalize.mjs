// Post-build finalization.
//
// Vite emits dist/index.html as a single, fully-inlined file. We:
//   1. Rename it to dist/recover.html (the canonical, hashable artifact — the
//      filename and its SHA-256 are part of the trust story).
//   2. Write a fresh dist/index.html that simply redirects to recover.html, so
//      the GitHub Pages URL root serves the app without changing the hash of
//      the recover.html file itself.
//   3. Print the SHA-256 of recover.html to the console.

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const distDir = path.resolve('dist');
const src = path.join(distDir, 'index.html');
const dst = path.join(distDir, 'recover.html');

// Step 1 — rename index.html → recover.html (the canonical artifact).
// We deliberately do NOT pre-check existence here: any race between check
// and use is an invitation to TOCTOU bugs (CodeQL js/file-system-race).
// If the file is missing, copyFileSync throws ENOENT, which is just as
// clear and atomic with the operation that actually depends on it.
try {
  fs.copyFileSync(src, dst);
} catch (err) {
  if (err && err.code === 'ENOENT') {
    console.error(`finalize: expected ${src} to exist (did the Vite build run?)`);
    process.exit(1);
  }
  throw err;
}

// Step 2 — replace dist/index.html with a tiny redirect page so the Pages root
// URL takes visitors straight to the app. This file is small and separate from
// the artifact whose hash we publish, so the published SHA-256 is unaffected.
const redirect = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>seQRets Recover</title>
    <meta http-equiv="refresh" content="0; url=./recover.html" />
    <link rel="canonical" href="./recover.html" />
    <meta name="robots" content="noindex" />
    <style>body{font-family:system-ui,sans-serif;background:#161311;color:#eee;padding:40px;text-align:center}</style>
  </head>
  <body>
    <p>Redirecting to <a href="./recover.html">recover.html</a>…</p>
    <script>location.replace('./recover.html');</script>
  </body>
</html>
`;
fs.writeFileSync(src, redirect);

// Step 3 — publish the hash of the canonical artifact.
const bytes = fs.readFileSync(dst);
const hash = crypto.createHash('sha256').update(bytes).digest('hex');
console.log(`\nSHA-256 of dist/recover.html:\n  ${hash}\n  (${bytes.length} bytes)\n`);
