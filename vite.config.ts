import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Lock the built artifact down with a strict Content-Security-Policy.
// The shipped HTML is fully self-contained: inline script, inline style, data-URI images.
// "connect-src 'none'" is the critical bit — even a tampered build cannot phone home
// without the user first editing the <meta> tag, which is visible in View Source.
const CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  // media-src allows the live-camera-scan feature to bind a MediaStream to
  // <video>. MediaStream itself is governed by the permission prompt, not
  // CSP — but some browsers still check media-src for the element source,
  // so we permit blob: (used by getUserMedia-related APIs) while keeping
  // everything else blocked.
  "media-src blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

// Additional privacy/security meta tags injected alongside the CSP. Only tags
// that are reliably honored by browsers via <meta http-equiv> are included
// here — things like Permissions-Policy and HSTS require real HTTP response
// headers, which GitHub Pages does not allow us to set. (HSTS is provided
// automatically by GitHub Pages.)
const SECURITY_META = [
  // Never send a Referer header when the user clicks a link out of the app.
  // Relevant because the footer includes a link to seqrets.app; a Referer
  // would reveal they were using the recovery tool.
  '<meta name="referrer" content="no-referrer" />',
].join('\n    ');

const injectCsp: Plugin = {
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(html) {
      return html.replace(
        '</title>',
        `</title>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    ${SECURITY_META}`,
      );
    },
  },
};

export default defineConfig({
  plugins: [viteSingleFile(), injectCsp],
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000_000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
