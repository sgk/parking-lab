import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as physics from '../dist/physics.js';
import * as layouts from '../dist/layout.js';
import { createCollisionSound } from '../dist/sound.js';
import { createAudioMock } from './audio-mock.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup() {
  const elements=new Map(),events={},windowEvents={},audio=createAudioMock();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{textContent:'',style:{},checked:true,attributes:{},classList:{toggle(){}},setAttribute(k,v){this.attributes[k]=v;},addEventListener(){},setPointerCapture(){},reportValidity(){return true;},getContext(){return {};},getBoundingClientRect(){return {left:20,width:400};}});
    return elements.get(id);
  };
  const document={getElementById:element,addEventListener(k,fn){events[k]=fn;}};
  const context=vm.createContext({...physics,...layouts,createCollisionSound,document,window:{AudioContext:audio.AudioContext,addEventListener(k,fn){windowEvents[k]=fn;}},requestAnimationFrame(){}});
  vm.runInContext(fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,''),context);
  const read=expression=>vm.runInContext(expression,context);
  const pointer=(x=220,y=200,control=false)=>({clientX:x,clientY:y,pointerId:1,pointerType:'touch',target:{closest:()=>control?{}:null},preventDefault(){}});
  return {element,events,windowEvents,audio,read,pointer};
}

test('controls, dimension changes, camera and reset remain functional',async()=>{
  const {element,events,windowEvents,audio,read,pointer}=setup();
  assert.equal(read('mode'),'car');
  element('bayWidth-plus').onclick();assert.equal(element('bayWidth').value,'3.5');assert.equal(read('layout.bayWidth'),3.4);
  element('bayWidth-minus').onclick();assert.equal(element('bayWidth').value,'3.4');
  element('bayWidth').value='4.0';element('bayWidth-plus').onclick();assert.equal(element('bayWidth').value,'4.0');assert.equal(element('bayWidth-plus').disabled,true);
  element('bayWidth').value='2.2';element('bayWidth-minus').onclick();assert.equal(element('bayWidth').value,'2.2');assert.equal(element('bayWidth-minus').disabled,true);
  element('layout-defaults').onclick();
  events.pointerdown(pointer());assert.equal(read('drag'),null);
  await element('sound-start').onclick();assert.equal(read('audioReady'),true);assert.equal(audio.oscillators().length,6);
  events.pointerdown(pointer());assert.equal(read('speed'),0);assert.equal(read('wheel'),0);
  events.pointermove(pointer(320,150));assert.equal(read('speed'),1);assert.equal(read('wheel'),1.5*Math.PI);
  await events.pointerup(pointer());assert.equal(read('speed'),0);assert.equal(read('wheel'),1.5*Math.PI);
  events.pointerdown(pointer());windowEvents.blur();assert.equal(read('drag'),null);
  events.pointerdown(pointer(20,20,true));assert.equal(read('drag'),null);
  element('map-mode').onclick();assert.equal(read('mode'),'map');element('car-mode').onclick();assert.equal(read('mode'),'car');
  element('bayWidth').value='2.5';element('bayDepth').value='5';element('aisleWidth').value='4';
  read('speed=1;trace.push([])');element('layout-form').onsubmit({preventDefault(){}});
  assert.equal(read('layout.bayWidth'),2.5);assert.equal(read('speed'),0);assert.equal(read('trace.length'),0);assert.equal(read('blocked(car)'),false);
  element('scenario-select').value='parallel-left';element('scenario-select').onchange();
  assert.equal(read('layout.scenarioId'),'parallel-left');assert.equal(read('layout.parked.length'),2);
  assert.equal(element('bayDepth-label').textContent,'縦列枠の長さ');
  element('bayWidth').value='3';element('bayDepth').value='7';element('aisleWidth').value='6';element('layout-form').onsubmit({preventDefault(){}});
  assert.equal(read('layout.scenarioId'),'parallel-left');assert.equal(read('layout.bayDepth'),7);
  element('layout-defaults').onclick();assert.equal(read('layout.bayDepth'),6.5);
  element('scenario-next').onclick();assert.equal(read('layout.scenarioId'),'parallel-right');
  element('scenario-prev').onclick();assert.equal(read('layout.scenarioId'),'parallel-left');
  element('overview').onclick();assert.equal(read('overview'),true);assert.equal(element('overview').attributes['aria-pressed'],'true');
});

test('collision audio survives suspension, sounds while held, and rearms on a new drag',async()=>{
  const {element,events,audio,read,pointer}=setup();await element('sound-start').onclick();
  const context=audio.contexts[0];context.state='suspended';
  events.pointerdown(pointer());
  read('car={x:layout.right-CAR.length/2-.005,y:layout.start.y,heading:0};wheel=0;speed=1;update(.02)');
  await flush();assert.equal(audio.oscillators().length,7);assert.equal(read('drag.id'),1);assert.equal(context.resumes,2);
  read('update(.02);update(.02)');await flush();assert.equal(audio.oscillators().length,7);
  await events.pointerup(pointer());events.pointerdown(pointer());read('wheel=0;speed=1;update(.02)');
  await flush();assert.equal(audio.oscillators().length,8);
  read('speed=-1;update(.2);speed=1;update(.3)');await flush();assert.equal(audio.oscillators().length,9);
  assert.match(element('sound-status').textContent,/衝突音の再生/);
  await element('collision-test').onclick();assert.equal(audio.oscillators().length,10);
  assert.match(element('sound-status').textContent,/衝突テスト音/);
});

test('success audio uses the exact test path, waits for resume, and repeats on each new successful operation',async()=>{
  const {element,events,audio,read,pointer}=setup();await element('sound-start').onclick();
  events.pointerdown(pointer());read('car={...layout.target};speed=0;update(.02)');
  assert.equal(read('parkedOk'),false);assert.equal(audio.oscillators().length,6);
  const context=audio.contexts[0];let finish;context.state='suspended';context.resumeGate=new Promise(resolve=>{finish=resolve;});
  const released=events.pointerup(pointer());read('update(.02)');assert.equal(read('parkedOk'),true);assert.equal(audio.oscillators().length,6);
  finish();await released;context.resumeGate=null;
  assert.equal(audio.oscillators().length,12);assert.equal(read('successCelebrated'),true);
  read('update(.02);update(.02)');await flush();assert.equal(audio.oscillators().length,12);
  events.pointerdown(pointer());await events.pointerup(pointer());assert.equal(audio.oscillators().length,18);
  await element('sound-test').onclick();assert.equal(audio.oscillators().length,24);
  assert.match(element('sound-status').textContent,/テスト音の再生/);
});

test('a cancelled gesture cannot show a success message without requesting success audio',async()=>{
  const {element,events,audio,read,pointer}=setup();await element('sound-start').onclick();
  events.pointerdown(pointer());read('car={...layout.target};speed=0');
  await events.pointercancel(pointer());read('update(.02)');
  assert.equal(read('parkedOk'),false);assert.doesNotMatch(element('status').textContent,/駐車成功/);
  assert.equal(audio.oscillators().length,6);
  events.pointerdown(pointer());await events.pointerup(pointer());
  assert.equal(read('parkedOk'),true);assert.equal(audio.oscillators().length,12);
});
