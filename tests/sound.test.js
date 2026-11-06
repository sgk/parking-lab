import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollisionSound } from '../dist/sound.js';

test('audio is initialized by user interaction and the buzz has a bounded envelope and cleanup',()=>{
  let instances=0,resumes=0;const nodes=[];
  class FakeAudioContext {
    constructor(){instances++;this.state='suspended';this.currentTime=10;this.destination={};}
    resume(){resumes++;this.state='running';return Promise.resolve();}
    createOscillator(){
      const node={frequency:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){this.disconnected=true;},start(time){this.startTime=time;},stop(time){this.stopTime=time;}};
      nodes.push(node);return node;
    }
    createBiquadFilter(){const node={frequency:{setValueAtTime(){}},connect(){},disconnect(){this.disconnected=true;}};nodes.push(node);return node;}
    createGain(){const values=[];const node={values,gain:{setValueAtTime(v){values.push(v);},linearRampToValueAtTime(v){values.push(v);},exponentialRampToValueAtTime(v){values.push(v);}},connect(){},disconnect(){this.disconnected=true;}};nodes.push(node);return node;}
  }
  const sound=createCollisionSound(FakeAudioContext);
  sound.buzz();assert.equal(instances,0);
  sound.unlock();sound.unlock();assert.equal(instances,1);assert.equal(resumes,1);
  sound.buzz();assert.equal(nodes[0].type,'square');
  assert.ok(Math.abs(nodes[0].stopTime-nodes[0].startTime-.36)<1e-8);
  assert.equal(nodes[2].values.at(-1),0);
  nodes[0].onended();assert.ok(nodes.every(node=>node.disconnected));
  sound.success();
  const melody=nodes.slice(3).filter(node=>node.frequency);
  assert.equal(melody.length,6);assert.ok(melody.every(node=>node.type==='sine'));
  assert.ok(melody[3].startTime>melody[0].startTime);
  for(const node of melody)node.onended();assert.ok(nodes.every(node=>node.disconnected));
});

test('unavailable or blocked audio reports one error and stops retrying',async()=>{
  let errors=0,attempts=0;
  const missing=createCollisionSound(undefined,()=>errors++);
  missing.unlock();missing.unlock();missing.buzz();assert.equal(errors,1);
  class RefusedAudioContext {
    constructor(){this.state='suspended';attempts++;}
    resume(){return Promise.reject(new Error('Audio blocked'));}
  }
  const denied=createCollisionSound(RefusedAudioContext,()=>errors++);
  denied.unlock();await Promise.resolve();denied.unlock();denied.buzz();
  assert.equal(attempts,1);assert.equal(errors,2);
});
