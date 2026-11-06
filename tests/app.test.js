import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as physics from '../dist/physics.js';

test('pointer controls stop on release, preserve steering, ignore buttons, and switch cameras',()=>{
  const elements=new Map(),events={},windowEvents={};
  function element(id) {
    if(!elements.has(id))elements.set(id,{textContent:'',style:{},checked:true,attributes:{},classList:{toggle(){}},setAttribute(k,v){this.attributes[k]=v;},addEventListener(){},setPointerCapture(){},getContext(){return {};},getBoundingClientRect(){return {left:20,width:400};}});
    return elements.get(id);
  }
  const document={getElementById:element,addEventListener(k,fn){events[k]=fn;}};
  const context=vm.createContext({...physics,document,window:{addEventListener(k,fn){windowEvents[k]=fn;}},requestAnimationFrame(){}});
  const source=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\n/,'');
  vm.runInContext(source,context);
  const read=expression=>vm.runInContext(expression,context);
  const pointer=(x,y,control=false)=>({clientX:x,clientY:y,pointerId:1,pointerType:'touch',target:{closest:()=>control?{}:null},preventDefault(){}});
  events.pointerdown(pointer(220,200));
  assert.equal(read('speed'),0);assert.equal(read('wheel'),0);
  events.pointermove(pointer(320,150));
  assert.equal(read('speed'),1);assert.equal(read('wheel'),1.5*Math.PI);
  events.pointerup(pointer(320,150));
  assert.equal(read('speed'),0);assert.equal(read('wheel'),1.5*Math.PI);
  events.pointerdown(pointer(50,50));assert.equal(read('speed'),0);assert.ok(read('wheel')<0);events.pointermove(pointer(50,100));
  assert.equal(read('speed'),-1);assert.ok(Math.abs(read('wheel')+.85*3*Math.PI)<1e-8);
  windowEvents.blur();assert.equal(read('speed'),0);assert.equal(read('drag'),null);
  events.pointerdown(pointer(20,20,true));assert.equal(read('drag'),null);
  element('recenter').onclick();assert.equal(read('mapCenter.x'),read('car.x'));
  element('car-mode').onclick();assert.equal(read('mode'),'car');assert.equal(element('car-mode').attributes['aria-pressed'],'true');
  element('center').onclick();assert.equal(read('wheel'),0);
  element('reset').onclick();assert.equal(read('car.x'),24);assert.equal(read('trace.length'),0);
});
