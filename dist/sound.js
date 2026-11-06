// Use one Web Audio implementation; initialize only during a user gesture.
export function createCollisionSound(AudioContextClass, onError = () => {}) {
  let context = null, failed = false, resuming = null;
  function fail() {
    if (!failed) onError('効果音を再生できません。ブラウザの音声設定を確認して再読み込みしてください。');
    failed = true;
  }
  return {
    async unlock() {
      if (failed) return false;
      try {
        if (!AudioContextClass) { fail(); return false; }
        if (!context) context = new AudioContextClass();
        if (context.state === 'closed') { fail(); return false; }
        if (context.state !== 'running') {
          if (!resuming) resuming = context.resume();
          await resuming;
          resuming = null;
        }
        return context.state === 'running';
      } catch { fail(); return false; }
    },
    success() {
      if (failed || !context || context.state !== 'running') return false;
      try {
        // A soft ascending C-major arpeggio with a lingering final chord.
        const now=context.currentTime;
        for(const [frequency,delay] of [[523.25,0],[659.25,.13],[783.99,.26],[1046.5,.42],[659.25,.42],[783.99,.42]]) {
          const oscillator=context.createOscillator(),gain=context.createGain();
          const start=now+delay;
          oscillator.type='triangle';oscillator.frequency.setValueAtTime(frequency,start);
          gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.1,start+.018);
          gain.gain.exponentialRampToValueAtTime(.001,start+.65);
          gain.gain.linearRampToValueAtTime(0,start+.72);
          oscillator.connect(gain);gain.connect(context.destination);
          oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
          oscillator.start(start);oscillator.stop(start+.74);
        }
        return true;
      } catch { fail(); return false; }
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
