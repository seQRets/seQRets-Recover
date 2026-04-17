# seQRets Recover — the Lifeboat

A minimal, single-file, offline recovery tool for [seQRets](https://seqrets.app) shares.

**If the seQRets app is ever unavailable to you — website gone, company dissolved, no internet — this tool will still recover your secret.** One HTML file. No install. No network. No dependencies beyond a web browser.

## For heirs and recipients

1. Download `recover.html` (or open the copy included with your inheritance packet). The file is published under [Releases](https://github.com/seQRets/seQRets-Recover/releases) — look under **Assets** on the most recent release. For a direct link to the latest version: [download recover.html](https://github.com/seQRets/seQRets-Recover/releases/latest/download/recover.html).
2. Open it in any web browser. You can turn off wi-fi first — it runs entirely on your device.
3. Paste or drag in your shares, enter the password, and click **Recover**.
4. Your secret appears. That's it.

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
npm run build     # produces dist/index.html and prints its SHA-256
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

This tool does **one thing**: recover a seQRets secret from shares.

It deliberately does not:

- Create new shares (use the main app)
- Scan QR codes with the camera (dependency weight, maintenance burden)
- Decrypt inheritance instruction bundles (separate format, separate tool if needed)
- Sync, upload, or phone home (ever)

If you need any of those, use [app.seqrets.app](https://app.seqrets.app) or the desktop app.
