import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as physics from '../dist/physics.js';
import * as layouts from '../dist/layout.js';
import { createCollisionSound } from '../dist/sound.js';
import { mapCards } from '../dist/thumbnails.js';
import { createAudioMock } from './audio-mock.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(play=true) {
  const elements=new Map(),events={},windowEvents={},audio=createAudioMock();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{textContent:'',style:{},checked:true,attributes:{},classList:{toggle(){}},setAttribute(k,v){this.attributes[k]=v;},focus(){},addEventListener(){},setPointerCapture(){},reportValidity(){return true;},getContext(){return {};},getBoundingClientRect(){return {left:20,top:0,width:400,height:600};}});
    return elements.get(id);
  };
  const document={getElementById:element,addEventListener(k,fn){events[k]=fn;}};
  const context=vm.createContext({...physics,...layouts,createCollisionSound,mapCards,document,window:{location:{hash:''},scrollY:0,scrollTo(){},AudioContext:audio.AudioContext,addEventListener(k,fn){windowEvents[k]=fn;}},requestAnimationFrame(){}});
  vm.runInContext(fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,''),context);
  const read=expression=>vm.runInContext(expression,context);
  const pointer=(x=220,y=200,control=false)=>({clientX:x,clientY:y,pointerId:1,pointerType:'touch',target:{closest:()=>control?{}:null},preventDefault(){}});
  const navigate=id=>{read(`window.location.hash=${JSON.stringify('#play/'+id)}`);windowEvents.hashchange();};
  if(play)navigate('standard');
  return {element,events,windowEvents,audio,read,pointer,navigate};
}

test('controls, dimension changes, camera and reset remain functional',async()=>{
  const {element,events,windowEvents,audio,read,pointer,navigate}=setup();
  assert.equal(read('mode'),'car');
  element('bayWidth-plus').onclick();assert.equal(element('bayWidth').value,'3.5');assert.equal(read('layout.bayWidth'),3.4);
  element('bayWidth-minus').onclick();assert.equal(element('bayWidth').value,'3.4');
  element('bayWidth').value='4.0';element('bayWidth-plus').onclick();assert.equal(element('bayWidth').value,'4.0');assert.equal(element('bayWidth-plus').disabled,true);
  element('bayWidth').value='2.2';element('bayWidth-minus').onclick();assert.equal(element('bayWidth').value,'2.2');assert.equal(element('bayWidth-minus').disabled,true);
  element('layout-defaults').onclick();
  events.pointerdown(pointer());assert.equal(read('drag'),null);
  await element('sound-start').onclick();assert.equal(read('audioReady'),true);assert.equal(audio.oscillators().length,6);
  events.pointerdown(pointer());assert.ok(read('speed')>0);assert.equal(read('wheel'),0);
  events.pointermove(pointer(320,150));assert.ok(read('speed')>0);assert.ok(Math.abs(read('wheel')-4*Math.PI/3)<1e-8);
  events.pointermove(pointer(235,150));assert.equal(read('wheel'),0);assert.ok(read('speed')>0);
  await events.pointerup(pointer());assert.equal(read('speed'),0);assert.equal(read('wheel'),0);
  events.pointerdown(pointer());windowEvents.blur();assert.equal(read('drag'),null);
  events.pointerdown(pointer(20,20,true));assert.equal(read('drag'),null);
  element('map-mode').onclick();assert.equal(read('mode'),'map');element('car-mode').onclick();assert.equal(read('mode'),'car');
  element('bayWidth').value='2.5';element('bayDepth').value='5';element('aisleWidth').value='4';
  read('speed=1;trace.push([])');element('layout-form').onsubmit({preventDefault(){}});
  assert.equal(read('layout.bayWidth'),2.5);assert.equal(read('speed'),0);assert.equal(read('trace.length'),0);assert.equal(read('blocked(car)'),false);
  navigate('parallel-left');
  assert.equal(read('layout.scenarioId'),'parallel-left');assert.equal(read('layout.parked.length'),2);
  assert.equal(element('bayDepth-label').textContent,'縦列枠の長さ');
  element('bayWidth').value='3';element('bayDepth').value='7';element('aisleWidth').value='6';element('layout-form').onsubmit({preventDefault(){}});
  assert.equal(read('layout.scenarioId'),'parallel-left');assert.equal(read('layout.bayDepth'),7);
  element('layout-defaults').onclick();assert.equal(read('layout.bayDepth'),6.5);
  navigate('parallel-right');assert.equal(read('layout.scenarioId'),'parallel-right');
  navigate('parallel-left');assert.equal(read('layout.scenarioId'),'parallel-left');
  element('overview').onclick();assert.equal(read('overview'),true);assert.equal(element('overview').attributes['aria-pressed'],'true');
});

test('absolute press positions control both modes immediately, change while held, and stop on release',async()=>{
  const {element,events,read,pointer}=setup();await element('sound-start').onclick();
  for(const mode of ['car','map']){
    element('reset').onclick();element(`${mode}-mode`).onclick();
    const basis=read('currentControlBasis(canvas.getBoundingClientRect())');
    const point=(f,r)=>pointer(basis.origin.x+basis.forward.x*f+basis.right.x*r,basis.origin.y+basis.forward.y*f+basis.right.y*r);
    const before=read('({...car})');
    events.pointerdown(point(0,0));assert.equal(read('speed'),0);assert.equal(read('wheel'),0);
    read('applyPointerInput();update(.2)');assert.equal(read('car.x'),before.x);assert.equal(read('car.y'),before.y);
    events.pointermove(point(0,basis.span*.25));assert.equal(read('speed'),0);assert.ok(read('wheel')>0);
    events.pointermove(point(basis.forwardSpan*.275,0));assert.ok(Math.abs(read('speed')-1)<1e-8);assert.equal(read('wheel'),0);
    events.pointermove(point(-basis.forwardSpan*.275,0));assert.ok(Math.abs(read('speed')+1)<1e-8);
    events.pointermove(point(0,0));assert.equal(read('speed'),0);assert.equal(read('wheel'),0);
    await events.pointerup(point(0,0));assert.equal(read('speed'),0);
    events.pointerdown(point(-basis.forwardSpan*.275,0));assert.ok(read('speed')<0,'pressing behind immediately reverses');
    await events.pointercancel(point(0,0));assert.equal(read('speed'),0);
    events.pointerdown(point(basis.forwardSpan*.275,0));assert.ok(read('speed')>0,'pressing ahead immediately drives forward');
    await events.pointerup(point(0,0));assert.equal(read('speed'),0);
  }
});

test('thumbnail selection opens play, returning stops the car, and unknown maps show an error',()=>{
  const {element,events,windowEvents,read,pointer}=setup(false);
  assert.equal(read('activeScreen'),'maps');assert.equal(element('play-screen').hidden,true);
  assert.equal((element('map-gallery').innerHTML.match(/class="map-card"/g)||[]).length,10);
  read('audioReady=true');events.pointerdown(pointer());assert.equal(read('drag'),null);
  element('map-gallery').onclick({target:{closest:()=>({dataset:{scenario:'forward'}})}});
  windowEvents.hashchange();assert.equal(read('activeScreen'),'play');assert.equal(read('layout.scenarioId'),'forward');
  assert.equal(element('map-screen').hidden,true);assert.equal(read('mode'),'car');
  read('speed=1;drag={id:1}');element('back-to-maps').onclick();windowEvents.hashchange();
  assert.equal(read('activeScreen'),'maps');assert.equal(read('speed'),0);assert.equal(read('drag'),null);
  read("window.location.hash='#play/missing'");windowEvents.hashchange();
  assert.equal(element('route-error').hidden,false);assert.match(element('route-error').textContent,/見つかりません/);
});

test('held positions follow the current car center and orientation without another pointer event',async()=>{
  const {element,events,read,pointer}=setup();await element('sound-start').onclick();element('map-mode').onclick();
  for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2,Math.PI/4]){
    read(`car={...layout.start,heading:${heading}}`);element('map-mode').onclick();
    const basis=read('currentControlBasis(canvas.getBoundingClientRect())');
    const point=pointer(basis.origin.x+basis.forward.x*basis.forwardSpan*.275,basis.origin.y+basis.forward.y*basis.forwardSpan*.275);
    events.pointerdown(point);assert.ok(Math.abs(read('speed')-1)<1e-8);assert.ok(Math.abs(read('wheel'))<1e-8);
    read('car.heading+=Math.PI;applyPointerInput()');assert.ok(Math.abs(read('speed')+1)<1e-8,'a turn changes the relative front/rear of a held point');
    read(`car.heading=${heading};car.x+=Math.cos(car.heading)*.5;car.y+=Math.sin(car.heading)*.5;applyPointerInput()`);
    assert.ok(read('speed')<1&&read('speed')>0,'approaching the held point reduces the throttle');
    await events.pointerup(point);assert.equal(read('speed'),0);
  }
});

test('ending a fixed-map gesture centers only the camera and preserves the car pose and north-up direction',async()=>{
  const {element,events,read,pointer}=setup();await element('sound-start').onclick();element('map-mode').onclick();
  const original=read('({...mapCenter})'),basis=read('currentControlBasis(canvas.getBoundingClientRect())');
  events.pointerdown(pointer(basis.origin.x,basis.origin.y));read('speed=1;update(.5)');
  assert.equal(read('mapCenter.x'),original.x,'the map stays fixed during a gesture');
  const pose=read('({...car})');assert.ok(Math.abs(pose.x-original.x)>.1);
  await events.pointerup(pointer());
  assert.equal(read('car.x'),pose.x);assert.equal(read('car.y'),pose.y);assert.equal(read('car.heading'),pose.heading);
  assert.equal(read('mapCenter.x'),pose.x);assert.equal(read('mapCenter.y'),pose.y);
  const view=read('cameraView(canvas.getBoundingClientRect())');
  assert.equal(view.rotation,0);assert.equal(view.carX,view.centerX);assert.equal(view.carY,view.centerY);
  const next=read('currentControlBasis(canvas.getBoundingClientRect())');
  assert.equal(next.origin.x,220);assert.equal(next.origin.y,299.5);
  element('overview').onclick();events.pointerdown(pointer());read('car.x-=.2');await events.pointerup(pointer());
  assert.equal(read('overview'),true,'full-map overview remains an overview');
  element('overview').onclick();assert.equal(read('mapCenter.x'),read('car.x'));
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
