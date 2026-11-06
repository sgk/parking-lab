export function createAudioMock() {
  const contexts=[], nodes=[];
  const parameter=()=>({values:[],setValueAtTime(value,time){this.values.push({value,time});},linearRampToValueAtTime(value,time){this.values.push({value,time});},exponentialRampToValueAtTime(value,time){this.values.push({value,time});}});
  const node=fields=>{const result={...fields,connect(){},disconnect(){this.disconnected=true;}};nodes.push(result);return result;};
  class AudioContext {
    constructor(){this.state='suspended';this.currentTime=10;this.destination={};this.resumes=0;contexts.push(this);}
    resume(){this.resumes++;if(this.resumeGate)return this.resumeGate.then(()=>{this.state='running';});this.state='running';return Promise.resolve();}
    createOscillator(){return node({frequency:parameter(),start(time){this.startTime=time;},stop(time){this.stopTime=time;}});}
    createGain(){return node({gain:parameter()});}
    createBiquadFilter(){return node({frequency:parameter()});}
    createAnalyser(){const context=this;return node({fftSize:256,getFloatTimeDomainData(samples){samples.fill(context.signalLevel??.05);}});}
  }
  return {AudioContext,contexts,nodes,oscillators:()=>nodes.filter(n=>'startTime' in n)};
}
