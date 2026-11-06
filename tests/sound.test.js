import test from 'node:test';
import assert from 'node:assert/strict';
import { createCollisionSound } from '../dist/sound.js';
import { createAudioMock } from './audio-mock.js';

test('test, collision and success share one context and schedule complete future envelopes',async()=>{
  const mock=createAudioMock(),sound=createCollisionSound(mock.AudioContext);
  assert.equal(mock.contexts.length,0);
  assert.equal(await sound.play('success'),true);
  const context=mock.contexts[0];
  assert.equal(context.resumes,1);assert.equal(mock.oscillators().length,6);
  for(const oscillator of mock.oscillators())assert.ok(oscillator.startTime>=context.currentTime+.04);
  context.state='suspended';
  assert.equal(await sound.play('collision'),true);
  assert.equal(context.resumes,2);assert.equal(mock.contexts.length,1);
  const buzz=mock.oscillators().at(-1);
  assert.equal(buzz.type,'square');assert.ok(Math.abs(buzz.stopTime-buzz.startTime-.36)<1e-8);
  context.state='suspended';assert.equal(await sound.play('success'),true);assert.equal(context.resumes,3);
  for(const oscillator of mock.oscillators())oscillator.onended();
  assert.ok(mock.nodes.every(n=>n.disconnected));
});

test('both game sounds wait for delayed audio resume instead of silently dropping the event',async()=>{
  for(const kind of ['collision','success']) {
    const mock=createAudioMock(),sound=createCollisionSound(mock.AudioContext);
    await sound.play('success');const context=mock.contexts[0],before=mock.oscillators().length;
    let finish;context.state='suspended';context.resumeGate=new Promise(resolve=>{finish=resolve;});
    const playing=sound.play(kind);await Promise.resolve();assert.equal(mock.oscillators().length,before);
    finish();assert.equal(await playing,true);assert.equal(mock.oscillators().length,before+(kind==='success'?6:1));
  }
});

test('concurrent events share one pending resume and each keep their requested sound',async()=>{
  const mock=createAudioMock(),sound=createCollisionSound(mock.AudioContext);
  await sound.play('success');const context=mock.contexts[0];
  let finish;context.state='suspended';context.resumeGate=new Promise(resolve=>{finish=resolve;});
  const collision=sound.play('collision'),success=sound.play('success');
  assert.equal(context.resumes,2);finish();
  assert.deepEqual(await Promise.all([collision,success]),[true,true]);assert.equal(mock.oscillators().length,13);
});

test('unsupported and rejected audio report failure and stop without retries or alternate methods',async()=>{
  let errors=0,attempts=0;
  const missing=createCollisionSound(undefined,()=>errors++);
  assert.equal(await missing.play('collision'),false);assert.equal(await missing.play('success'),false);assert.equal(errors,1);
  class RefusedContext {constructor(){this.state='suspended';attempts++;}resume(){return Promise.reject(new Error('blocked'));}}
  const denied=createCollisionSound(RefusedContext,()=>errors++);
  assert.equal(await denied.play('success'),false);assert.equal(await denied.play('collision'),false);
  assert.equal(attempts,1);assert.equal(errors,2);
});
