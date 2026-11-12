// Every sound, including the test button, uses the same activation and scheduling path.
export function createCollisionSound(AudioContextClass, onError = () => {}, onPlayback = null) {
  let context = null, failed = false, resuming = null, requestId = 0;
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
    unlock,
    async play(kind) {
      if (kind !== 'success' && kind !== 'collision') throw new TypeError('Unknown sound');
      const id=++requestId;
      // One resume attempt per requested event; no alternate method or retry loop.
      if (!await unlock()) {if(onPlayback)onPlayback({id,kind,phase:'failed'});return false;}
      try {
        // Allow the audio rendering thread to receive the complete attack envelope.
        const now = context.currentTime + .04;
        const notes = kind === 'success'
          ? [[523.25,0],[659.25,.13],[783.99,.26],[1046.5,.42],[659.25,.42],[783.99,.42]]
          : [[220,0]];
        const analyser=context.createAnalyser();analyser.fftSize=256;analyser.connect(context.destination);
        let remaining=notes.length,timer=null,observationComplete=false;
        const emit=phase=>{if(onPlayback)onPlayback({id,kind,phase});};
        const samples=new Float32Array(analyser.fftSize),deadline=Date.now()+2000;
        function watchSignal() {
          analyser.getFloatTimeDomainData(samples);
          if(samples.some(sample=>Math.abs(sample)>.0005)){observationComplete=true;emit('signal');return;}
          if(context.state!=='running'){observationComplete=true;emit('paused');return;}
          if(Date.now()>=deadline){observationComplete=true;emit('not-observed');return;}
          timer=setTimeout(watchSignal,25);
        }
        for (const [frequency,delay] of notes) {
          const oscillator = context.createOscillator(), gain = context.createGain();
          const start = now + delay;
          oscillator.type = kind === 'success' ? 'triangle' : 'square';
          oscillator.frequency.setValueAtTime(frequency,start);
          gain.gain.setValueAtTime(0,start);
          gain.gain.linearRampToValueAtTime(kind === 'success' ? .1 : .16,start+.018);
          let filter = null;
          if (kind === 'collision') {
            oscillator.frequency.linearRampToValueAtTime(180,start+.45);
            filter = context.createBiquadFilter();filter.type='lowpass';filter.frequency.setValueAtTime(1200,start);
            gain.gain.setValueAtTime(.16,start+.38);
            gain.gain.linearRampToValueAtTime(0,start+.49);
            oscillator.connect(filter);filter.connect(gain);
          } else {
            gain.gain.exponentialRampToValueAtTime(.001,start+.65);
            gain.gain.linearRampToValueAtTime(0,start+.72);
            oscillator.connect(gain);
          }
          gain.connect(analyser);
          oscillator.onended=()=>{
            oscillator.disconnect();gain.disconnect();if(filter)filter.disconnect();
            if(--remaining===0){clearTimeout(timer);if(!observationComplete)emit('not-observed');analyser.disconnect();}
          };
          oscillator.start(start);oscillator.stop(start+(kind === 'success' ? .74 : .5));
        }
        emit('scheduled');if(onPlayback)timer=setTimeout(watchSignal,25);
        return true;
      } catch { fail(); return false; }
    }
  };
}
