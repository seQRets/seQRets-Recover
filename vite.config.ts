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

const injectCsp: Plugin = {
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(html) {
      return html.replace(
        '</title>',
        `</title>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
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
