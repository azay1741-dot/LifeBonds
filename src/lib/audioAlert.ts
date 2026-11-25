let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (sharedAudioContext && sharedAudioContext.state !== 'closed') {
    return sharedAudioContext;
  }
  const AudioCtx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  sharedAudioContext = new AudioCtx();
  return sharedAudioContext;
}

export async function unlockCriticalAlertAudio(): Promise<boolean> {
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    return ctx.state === 'running';
  } catch {
    return false;
  }
}

/**
 * Plays a gentle, low-gain two-tone clinical chime (A5 -> D6) for newly admitted
 * P1 Critical triage patients without harsh alarm frequencies.
 */
export async function playDiscreetCriticalChime(): Promise<void> {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (ctx.state !== 'running') return;

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.09, now);
    masterGain.connect(ctx.destination);

    const scheduleTone = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);

      noteGain.gain.setValueAtTime(0.0001, now + startOffset);
      noteGain.gain.exponentialRampToValueAtTime(0.85, now + startOffset + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);

      osc.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    scheduleTone(880, 0, 0.16);
    scheduleTone(1174.66, 0.13, 0.28);
  } catch {
    // Ignore browser autoplay or Web Audio restrictions
  }
}
