// WebAudio synth SFX only — no external files. The context is created lazily on the first
// user gesture (browser autoplay rule) and every sound is a short oscillator/noise envelope.

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (context) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      context = new AC();
      master = context.createGain();
      master.gain.value = muted ? 0 : 0.22;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return true;
  }

  function unlock() {
    if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
  }

  function tone(freq0, freq1, duration, type, volume, delay = 0) {
    if (!ensure() || muted) return;
    const t0 = context.currentTime + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq0, t0);
    if (freq1 !== freq0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq1), t0 + duration);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function noise(duration, volume, lowFreq, delay = 0) {
    if (!ensure() || muted) return;
    const t0 = context.currentTime + delay;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowFreq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t0);
  }

  return {
    unlock,
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.22;
    },
    isMuted() {
      return muted;
    },
    laser() { tone(880, 220, 0.09, 'square', 0.16); },
    enemyShot() { tone(320, 180, 0.08, 'sawtooth', 0.06); },
    explosion(big = false) {
      noise(big ? 0.5 : 0.28, big ? 0.5 : 0.3, big ? 900 : 1400);
      tone(big ? 120 : 160, 40, big ? 0.45 : 0.25, 'sine', 0.4);
    },
    hit() { tone(200, 70, 0.18, 'triangle', 0.35); noise(0.12, 0.2, 800); },
    powerup() {
      tone(523, 523, 0.09, 'sine', 0.25);
      tone(659, 659, 0.09, 'sine', 0.25, 0.08);
      tone(784, 784, 0.14, 'sine', 0.25, 0.16);
    },
    waveChime() { tone(440, 440, 0.12, 'sine', 0.2); tone(660, 660, 0.18, 'sine', 0.2, 0.11); },
    gameOver() {
      tone(392, 392, 0.22, 'sawtooth', 0.22);
      tone(311, 311, 0.22, 'sawtooth', 0.22, 0.2);
      tone(233, 110, 0.5, 'sawtooth', 0.22, 0.4);
    },
  };
}
