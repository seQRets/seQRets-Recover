// Tiny Web Audio chime for successful interactions.
// Synthesized at runtime — no audio file, no network, fits the "one file forever" goal.

let audioCtx: AudioContext | undefined;

function getCtx(): AudioContext | undefined {
  if (audioCtx) return audioCtx;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return undefined;
  audioCtx = new AC();
  return audioCtx;
}

export function playChime() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const now = ctx.currentTime;
  // Two soft sine notes: E5 → B5, short and friendly.
  const notes: Array<[number, number, number]> = [
    [659.25, 0, 0.18],
    [987.77, 0.09, 0.26],
  ];

  for (const [freq, start, dur] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;

    // Quick linear attack, exponential decay — no clicks, no ringing.
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(0.12, now + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.02);
  }
}
