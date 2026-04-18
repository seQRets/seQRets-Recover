# seQRets Recover — the Lifeboat

A minimal, single-file, offline recovery tool for [seQRets](https://seqrets.app) shares.

**If the seQRets app is ever unavailable to you — website gone, company dissolved, no internet — this tool will still recover your secret.** One HTML file. No install. No network. No dependencies beyond a web browser.

---

## 👉 Open the app here: **https://seqrets.github.io/seQRets-Recover/**

That link is everything you need. Click it, follow the on-screen steps, and your secret comes back. You do **not** need to install anything or download any files first.

On that hosted page you can also **scan your printed Qards directly with your computer or phone camera** — no photos, no typing, no copying.

If you prefer to have a copy on your own computer (recommended for long-term safekeeping), see [For heirs and recipients](#for-heirs-and-recipients) below.

---

## For heirs and recipients

### The simplest path

Open **https://seqrets.github.io/seQRets-Recover/** in any modern browser. Click **Scan with camera** and point it at your Qards one by one. Enter your password. Click **Recover**. Done.

That's it. The page works entirely inside your browser — nothing you type, upload, or scan ever leaves your device.

### The offline path (for long-term safety)

For maximum safety — especially if you're storing a copy with your estate documents — keep a downloaded copy of `recover.html` alongside your Qards. It works forever, with no internet, on any computer.

#### Before you start — disconnect from the internet

This is the single most important thing you can do to protect your secrets while recovering them. `recover.html` runs entirely on your device and does not need the internet to work — so don't give it the chance.

**On your computer:** turn off Wi-Fi from the menu bar, or unplug the Ethernet cable if you use one. You can confirm you're disconnected by looking at your operating system's network icon — a macOS Wi-Fi icon with a slash through it, or a Windows taskbar icon showing "Not connected."

**Also recommended:** open the page in a **private / incognito** browser window (`⌘+Shift+N` in Chrome/Edge, `⌘+Shift+P` in Firefox/Safari), and disable browser extensions for that window. Private windows don't save history, cache, or form data, and extensions can read everything you type.

**Why this matters:** the app is designed not to send data anywhere, and its built-in Content-Security-Policy tells the browser to refuse network requests. But the safest layer of defense is the one that doesn't depend on anything working correctly. If Wi-Fi is off, no misconfiguration, no tampering, and no software bug can leak your secret.

#### Using it offline

1. Download `recover.html` (or open the copy included with your inheritance packet). The file is published under [Releases](https://github.com/seQRets/seQRets-Recover/releases) — look under **Assets** on the most recent release. For a direct link to the latest version: [download recover.html](https://github.com/seQRets/seQRets-Recover/releases/latest/download/recover.html).
2. Disconnect from the internet (see above).
3. Open `recover.html` in any web browser — just double-click the file.
4. Paste or drag in your shares (or drop an encrypted inheritance plan JSON file), enter the password, and click **Recover**.
5. Your secret appears. That's it.

Note: the "Scan with camera" button is only available on the hosted version above — browsers block camera access when HTML is opened from a local file. The offline copy still accepts photos of your Qards via drag-and-drop or file upload.

If you need help, see the on-screen instructions — the page is designed to be used without any prior knowledge.

## For auditors and the paranoid

This tool is an independent reference implementation of the seQRets share format, written in ~200 lines of TypeScript. It uses the same audited cryptographic primitives as the main seQRets app:

- **Key derivation:** Argon2id (`@noble/hashes`) — m=65536 (64 MB), t=4, p=1, dkLen=32
- **Cipher:** XChaCha20-Poly1305 (`@noble/ciphers`) — 24-byte nonce prepended to ciphertext
- **Secret sharing:** Shamir over GF(256) (`shamir-secret-sharing`)
- **Compression:** gzip (`pako`)
- **BIP-39 reassembly:** `@scure/bip39` English wordlist

**Share format:** `seQRets|<base64 salt>|<base64 nonce+ciphertext>|sha256:<hex>` — plaintext, self-describing, documented.

All dependencies are MIT/BSD licensed, widely used, and have existing independent reimplementations in Python, Go, Rust, Java, Swift, and C#. If you want to write your own recovery tool from first principles, the format is simple enough to do so in an afternoon.

## Build from source

```bash
npm install
npm run build     # produces dist/recover.html and prints its SHA-256
```

The build output is the entire app: HTML, CSS, JS, and crypto libraries inlined into one file. No CDN references. No runtime network requests. Save it, archive it, mirror it, print it — it will work offline on any machine with a modern browser.

### Verifying a downloaded copy

Every GitHub release publishes the SHA-256 of `recover.html`. Before trusting a downloaded copy — especially one handed to your heirs — verify the hash:

```bash
# macOS / Linux
shasum -a 256 recover.html

# Windows (PowerShell)
Get-FileHash recover.html -Algorithm SHA256
```

The printed hash must match the one in the release notes exactly. If it doesn't, the file has been modified — don't use it.

### Defense in depth

The built HTML ships with a strict `Content-Security-Policy`:

```
default-src 'none'; connect-src 'none'; img-src data:; ...
```

This means the browser itself refuses to let the page open a network connection, even if the file were tampered with to try. You can confirm this by viewing the `<meta http-equiv="Content-Security-Policy">` tag in View Source, or by watching the Network tab in DevTools while you use the page — it must stay empty.

The built HTML also sets `<meta name="referrer" content="no-referrer">` so the footer link to `seqrets.app` does not leak a Referer header revealing you were using the recovery tool.

### Is the hosted version (https://seqrets.github.io/seQRets-Recover/) safe?

Yes — and the threat model is worth understanding explicitly.

When you open the hosted URL, you are trusting three things:

1. **GitHub Pages serves the bytes we published.** Every push to `main` builds reproducibly and deploys via a committed [GitHub Actions workflow](.github/workflows/pages.yml). The hash of the served `recover.html` matches the hash attached to the corresponding GitHub Release — you can verify this yourself:
   ```bash
   curl -s https://seqrets.github.io/seQRets-Recover/recover.html | shasum -a 256
   ```
   The result must match the SHA-256 in the latest [release notes](https://github.com/seQRets/seQRets-Recover/releases).

2. **TLS / HTTPS is not compromised between you and GitHub.** Standard web PKI — same as your bank.

3. **The CSP enforces what the code claims.** Even if the bytes were tampered with, `connect-src 'none'` prevents the page from opening a network connection. An attacker would have to compromise both the served file AND your browser's CSP enforcement to exfiltrate a secret.

**If you prefer not to trust GitHub as a server at all**, download `recover.html` from the [latest release](https://github.com/seQRets/seQRets-Recover/releases/latest), verify its SHA-256 against the release notes on a different device, disconnect from the internet, and open the local file. The downloaded file and the hosted file are byte-identical.

### Reporting a vulnerability

Report security issues privately via [GitHub's private vulnerability reporting](https://github.com/seQRets/seQRets-Recover/security/advisories/new). This is also linked from `/.well-known/security.txt` on the hosted site.

Please include: the version/commit you observed the issue on, steps to reproduce, and what an attacker could achieve. We prioritize issues by impact to secret confidentiality.

### Security review scope

Because this is a static, client-side-only app with no backend, no accounts, and no user-generated HTML, the conventional web-app review checklist is largely inapplicable. The real review surface is:

- The ~500 lines of TypeScript in `src/` (auditable in an afternoon)
- The pinned dependencies in `package.json` (cryptographic primitives: `@noble/ciphers`, `@noble/hashes`, `@scure/bip39`, `shamir-secret-sharing`; image decoding: `@zxing/library`; no frameworks)
- The CSP in `vite.config.ts`
- The reproducibility of the build (locked with `package-lock.json`)

There is no server-side code to review. There is no database. There are no credentials. There is no session management. No data is persisted or transmitted.

## Design goals, in order of priority

1. **It must work in 30 years.** No build-time network fetches. No CDN runtime dependencies. No frameworks with short lifespans. System fonts only.
2. **It must work offline.** No network requests, ever. Check your browser's network tab.
3. **It must be understandable by a grieving heir under stress.** Warm copy, plain language, large click targets, forgiving error messages.
4. **It must be verifiable by a paranoid auditor.** Small source tree, standard primitives, MIT license, no minification obscurity in the source.
5. **It must be identical in behavior to the main seQRets app.** Same primitives, same parameters, same format.

## License

MIT — see [LICENSE](./LICENSE). Take it, fork it, mirror it, embed it, print it. No attribution required, but appreciated.

The main seQRets app is AGPL-3.0-or-later. The intentional license difference reflects their different purposes: the main app is a product protected from proprietary forks; this tool is a humanitarian commons meant to be rehosted everywhere.

## Scope

This tool does **two things**:

1. **Recover a secret from shares.** Drop in QR images or paste share text, enter the password, get your secret back.
2. **Decrypt an encrypted inheritance plan.** Drop in the encrypted plan JSON, enter the password, get the decrypted plan (shown as raw JSON — the lifeboat deliberately doesn't interpret the schema, so that plan-schema changes in the main app never break recovery).

Both paths share the same cryptographic primitives and the same password/keyfile UI. The tool auto-detects which one you're giving it.

It deliberately does not:

- Create new shares or new inheritance plans (use the main app)
- Scan QR codes with the camera (dependency weight, maintenance burden)
- Render the inheritance plan with a nice UI (would require tracking the plan schema, which evolves — raw JSON is future-proof)
- Sync, upload, or phone home (ever)

If you need any of those, use [app.seqrets.app](https://app.seqrets.app) or the desktop app.
