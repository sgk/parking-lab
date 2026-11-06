// Use one Web Audio implementation; initialize only during a user gesture.
export function createCollisionSound(AudioContextClass, onError = () => {}) {
  let context = null, failed = false, resuming = false;
  function fail() {
    if (!failed) onError('接触音を再生できません。ブラウザの音声設定を確認して再読み込みしてください。');
    failed = true;
  }
  return {
    unlock() {
      if (failed) return;
      try {
        if (!AudioContextClass) { fail(); return; }
        if (!context) context = new AudioContextClass();
        if (context.state === 'suspended' && !resuming) {
          resuming = true;
          context.resume().then(() => { resuming = false; }, fail);
        }
      } catch { fail(); }
    },
    buzz() {
      if (failed || !context || context.state !== 'running') return;
      try {
        const now = context.currentTime;
        const oscillator = context.createOscillator();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(110, now);
        oscillator.frequency.linearRampToValueAtTime(90, now + .32);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(650, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(.09, now + .015);
        gain.gain.setValueAtTime(.09, now + .25);
        gain.gain.linearRampToValueAtTime(0, now + .35);
        oscillator.connect(filter);filter.connect(gain);gain.connect(context.destination);
        oscillator.onended = () => { oscillator.disconnect();filter.disconnect();gain.disconnect(); };
        oscillator.start(now);oscillator.stop(now + .36);
      } catch { fail(); }
    }
  };
}
