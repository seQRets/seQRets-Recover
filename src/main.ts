import { recover, extractShares } from './recover';
import { decodeQrFromFile, isImageFile } from './qr';
import { playChime } from './tone';
import { Buffer } from 'buffer';

// Polyfill for libraries that expect global Buffer (shamir-secret-sharing, etc).
// Vite bundles this inline, so it lives inside the single HTML file.
(globalThis as any).Buffer = Buffer;

// ── DOM refs ──────────────────────────────────────────────────────────

const dropzone = document.getElementById('dropzone') as HTMLDivElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const shareTextarea = document.getElementById('share-textarea') as HTMLTextAreaElement;
const shareList = document.getElementById('share-list') as HTMLUListElement;

const passwordInput = document.getElementById('password') as HTMLInputElement;
const togglePassword = document.getElementById('toggle-password') as HTMLButtonElement;

const keyfileInput = document.getElementById('keyfile-input') as HTMLInputElement;
const keyfileClear = document.getElementById('keyfile-clear') as HTMLButtonElement;
const keyfileName = document.getElementById('keyfile-name') as HTMLDivElement;

const recoverBtn = document.getElementById('recover-btn') as HTMLButtonElement;
const progress = document.getElementById('progress') as HTMLDivElement;
const progressText = document.getElementById('progress-text') as HTMLSpanElement;
const errorBox = document.getElementById('error') as HTMLDivElement;

const resultCard = document.getElementById('result-card') as HTMLElement;
const resultLabel = document.getElementById('result-label') as HTMLDivElement;
const reveal = document.getElementById('reveal') as HTMLDivElement;
const revealContent = document.getElementById('reveal-content') as HTMLPreElement;
const revealOverlay = document.getElementById('reveal-overlay') as HTMLButtonElement;
const revealHide = document.getElementById('reveal-hide') as HTMLButtonElement;
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;
const doneBtn = document.getElementById('done-btn') as HTMLButtonElement;

// ── Share state ───────────────────────────────────────────────────────

const shares = new Set<string>();

function renderShares() {
  shareList.innerHTML = '';
  for (const share of shares) {
    const li = document.createElement('li');
    const chip = document.createElement('span');
    chip.className = 'share-chip';
    chip.textContent = 'Share';
    li.appendChild(chip);

    const preview = document.createElement('span');
    preview.className = 'share-preview';
    preview.textContent = previewShare(share);
    preview.title = share;
    li.appendChild(preview);

    const remove = document.createElement('button');
    remove.className = 'share-remove';
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', 'Remove this share');
    remove.addEventListener('click', () => {
      shares.delete(share);
      renderShares();
    });
    li.appendChild(remove);

    shareList.appendChild(li);
  }
  recoverBtn.disabled = shares.size === 0;
}

function previewShare(share: string): string {
  const parts = share.split('|');
  if (parts.length < 3) return share.slice(0, 40) + '…';
  const data = parts[2];
  return `seQRets|…|${data.slice(0, 10)}…${data.slice(-6)}`;
}

function addShares(input: string) {
  const found = extractShares(input);
  if (!found.length) {
    showError('No seQRets shares found in that input. A share should start with "seQRets|".');
    return;
  }
  const sizeBefore = shares.size;
  clearError();
  for (const s of found) shares.add(s);
  renderShares();
  if (shares.size > sizeBefore) playChime();
}

// ── Drag and drop ─────────────────────────────────────────────────────

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

['dragenter', 'dragover'].forEach(evt => {
  dropzone.addEventListener(evt, e => {
    e.preventDefault();
    dropzone.classList.add('is-dragging');
  });
});

['dragleave', 'drop'].forEach(evt => {
  dropzone.addEventListener(evt, e => {
    e.preventDefault();
    dropzone.classList.remove('is-dragging');
  });
});

dropzone.addEventListener('drop', async e => {
  const files = e.dataTransfer?.files;
  if (!files) return;
  await readFiles(Array.from(files));
});

fileInput.addEventListener('change', async () => {
  if (!fileInput.files) return;
  await readFiles(Array.from(fileInput.files));
  fileInput.value = '';
});

async function readFiles(files: File[]) {
  for (const file of files) {
    try {
      if (isImageFile(file)) {
        const decoded = await decodeQrFromFile(file);
        addShares(decoded);
      } else {
        const text = await file.text();
        addShares(text);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : `Could not read the file "${file.name}".`);
    }
  }
}

// ── Textarea paste ────────────────────────────────────────────────────

shareTextarea.addEventListener('paste', e => {
  const text = e.clipboardData?.getData('text');
  if (text) {
    e.preventDefault();
    addShares(text);
    shareTextarea.value = '';
  }
});

shareTextarea.addEventListener('blur', () => {
  if (shareTextarea.value.trim()) {
    addShares(shareTextarea.value);
    shareTextarea.value = '';
  }
});

// ── Password toggle ───────────────────────────────────────────────────

togglePassword.addEventListener('click', () => {
  const isPw = passwordInput.type === 'password';
  passwordInput.type = isPw ? 'text' : 'password';
  togglePassword.textContent = isPw ? 'Hide' : 'Show';
  togglePassword.setAttribute('aria-label', isPw ? 'Hide password' : 'Show password');
});

// ── Keyfile ───────────────────────────────────────────────────────────

let keyfileB64: string | undefined;

keyfileInput.addEventListener('change', async () => {
  const file = keyfileInput.files?.[0];
  if (!file) {
    keyfileB64 = undefined;
    keyfileName.textContent = '';
    keyfileClear.hidden = true;
    return;
  }
  const buf = new Uint8Array(await file.arrayBuffer());
  keyfileB64 = Buffer.from(buf).toString('base64');
  keyfileName.textContent = `Using keyfile: ${file.name} (${buf.length} bytes)`;
  keyfileClear.hidden = false;
});

keyfileClear.addEventListener('click', () => {
  keyfileB64 = undefined;
  keyfileInput.value = '';
  keyfileName.textContent = '';
  keyfileClear.hidden = true;
});

// ── Error / progress ──────────────────────────────────────────────────

function showError(msg: string) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = '';
}

function setProgress(text: string | null) {
  if (text === null) {
    progress.hidden = true;
    return;
  }
  progress.hidden = false;
  progressText.textContent = text;
}

// ── Recover ───────────────────────────────────────────────────────────

recoverBtn.addEventListener('click', async () => {
  clearError();
  if (shares.size === 0) {
    showError('Please add at least one share.');
    return;
  }
  if (!passwordInput.value) {
    showError('Please enter your password.');
    return;
  }

  recoverBtn.disabled = true;
  setProgress('Starting…');

  try {
    const result = await recover(
      Array.from(shares),
      passwordInput.value,
      keyfileB64,
      stage => setProgress(`${stage}…`),
    );

    setProgress(null);
    passwordInput.value = '';
    if (togglePassword.textContent === 'Hide') {
      passwordInput.type = 'password';
      togglePassword.textContent = 'Show';
    }
    showResult(result);
    startIdleTimers();
  } catch (err) {
    setProgress(null);
    showError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
  } finally {
    recoverBtn.disabled = shares.size === 0;
  }
});

// ── Result ────────────────────────────────────────────────────────────

function showResult(result: { secret: string; label?: string }) {
  revealContent.textContent = result.secret;
  if (result.label) {
    resultLabel.textContent = `Label: ${result.label}`;
    resultLabel.hidden = false;
  } else {
    resultLabel.hidden = true;
  }
  reveal.classList.remove('is-revealed');
  resultCard.hidden = false;
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

revealOverlay.addEventListener('click', () => {
  reveal.classList.add('is-revealed');
});

revealHide.addEventListener('click', () => {
  reveal.classList.remove('is-revealed');
});

const CLIPBOARD_CLEAR_MS = 30_000;
let clipboardClearTimer: number | undefined;

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(revealContent.textContent || '');
    if (clipboardClearTimer) window.clearTimeout(clipboardClearTimer);

    let remaining = Math.round(CLIPBOARD_CLEAR_MS / 1000);
    copyBtn.textContent = `Copied — clears in ${remaining}s`;
    const tick = window.setInterval(() => {
      remaining -= 1;
      if (remaining > 0) copyBtn.textContent = `Copied — clears in ${remaining}s`;
    }, 1000);

    clipboardClearTimer = window.setTimeout(async () => {
      window.clearInterval(tick);
      try {
        await navigator.clipboard.writeText(' ');
      } catch {
        // Browsers require focus to write to the clipboard. If the user has switched
        // windows, this silently fails — nothing we can do. The notice below the
        // button warns them about this.
      }
      copyBtn.textContent = 'Copy to clipboard';
    }, CLIPBOARD_CLEAR_MS);
  } catch {
    showError('Could not copy to clipboard. Your browser may have blocked it — select the text manually instead.');
  }
});

function clearEverything() {
  shares.clear();
  renderShares();
  passwordInput.value = '';
  keyfileB64 = undefined;
  keyfileInput.value = '';
  keyfileName.textContent = '';
  keyfileClear.hidden = true;
  revealContent.textContent = '';
  reveal.classList.remove('is-revealed');
  resultCard.hidden = true;
  clearError();
  stopIdleTimers();
  if (clipboardClearTimer) {
    window.clearTimeout(clipboardClearTimer);
    clipboardClearTimer = undefined;
  }
  copyBtn.textContent = 'Copy to clipboard';
}

doneBtn.addEventListener('click', () => {
  clearEverything();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ── Idle timers ───────────────────────────────────────────────────────
// Auto-blur the secret after 2 min of no interaction, clear everything after 10 min.
// Only active while the result card is showing.

const IDLE_BLUR_MS = 2 * 60_000;
const IDLE_CLEAR_MS = 10 * 60_000;
let idleBlurTimer: number | undefined;
let idleClearTimer: number | undefined;

function stopIdleTimers() {
  if (idleBlurTimer) window.clearTimeout(idleBlurTimer);
  if (idleClearTimer) window.clearTimeout(idleClearTimer);
  idleBlurTimer = undefined;
  idleClearTimer = undefined;
}

function startIdleTimers() {
  stopIdleTimers();
  idleBlurTimer = window.setTimeout(() => {
    reveal.classList.remove('is-revealed');
  }, IDLE_BLUR_MS);
  idleClearTimer = window.setTimeout(() => {
    clearEverything();
  }, IDLE_CLEAR_MS);
}

['mousedown', 'keydown', 'touchstart'].forEach(evt => {
  document.addEventListener(evt, () => {
    if (!resultCard.hidden) startIdleTimers();
  }, { passive: true });
});

// ── Init ──────────────────────────────────────────────────────────────

renderShares();
