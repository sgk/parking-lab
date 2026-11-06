// Every sound, including the test button, uses the same activation and scheduling path.
export function createCollisionSound(AudioContextClass, onError = () => {}) {
  let context = null, failed = false, resuming = null;
  function fail() {
    if (!failed) onError('効果音を再生できません。ブラウザの音声設定を確認して再読み込みしてください。');
    failed = true;
  }
  async function unlock() {
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
  }
  return {
    async play(kind) {
      if (kind !== 'success' && kind !== 'collision') throw new TypeError('Unknown sound');
      // One resume attempt per requested event; no alternate method or retry loop.
      if (!await unlock()) return false;
      try {
        // Allow the audio rendering thread to receive the complete attack envelope.
        const now = context.currentTime + .04;
        const notes = kind === 'success'
          ? [[523.25,0],[659.25,.13],[783.99,.26],[1046.5,.42],[659.25,.42],[783.99,.42]]
          : [[110,0]];
        for (const [frequency,delay] of notes) {
          const oscillator = context.createOscillator(), gain = context.createGain();
          const start = now + delay;
          oscillator.type = kind === 'success' ? 'triangle' : 'square';
          oscillator.frequency.setValueAtTime(frequency,start);
          gain.gain.setValueAtTime(0,start);
          gain.gain.linearRampToValueAtTime(kind === 'success' ? .1 : .09,start+.018);
          let filter = null;
          if (kind === 'collision') {
            oscillator.frequency.linearRampToValueAtTime(90,start+.32);
            filter = context.createBiquadFilter();filter.type='lowpass';filter.frequency.setValueAtTime(650,start);
            gain.gain.setValueAtTime(.09,start+.25);
            gain.gain.linearRampToValueAtTime(0,start+.35);
            oscillator.connect(filter);filter.connect(gain);
          } else {
            gain.gain.exponentialRampToValueAtTime(.001,start+.65);
            gain.gain.linearRampToValueAtTime(0,start+.72);
            oscillator.connect(gain);
          }
          gain.connect(context.destination);
          oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();if(filter)filter.disconnect();};
          oscillator.start(start);oscillator.stop(start+(kind === 'success' ? .74 : .36));
        }
        return true;
      } catch { fail(); return false; }
    }
  };
}
