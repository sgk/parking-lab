import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR, advance, corners, overlaps, dragInput } from '../dist/physics.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('a tap changes neither velocity nor steering',()=>{
  const result=dragInput(0,0,2);near(result.speed,0);near(result.wheel,2);
});
test('drag direction, proportional speed, and steering limits',()=>{
  near(dragInput(0,-50,0).speed,1);near(dragInput(0,50,0).speed,-1);
  near(dragInput(1000,-1000,0).wheel,3*Math.PI);near(dragInput(-1000,1000,0).wheel,-3*Math.PI);
  near(dragInput(0,-1000,0).speed,2);near(dragInput(0,1000,0).speed,-2);
  near(dragInput(10,0,1).wheel,1+.1*CAR.maxWheel);
});
test('distance integrates velocity and preserves direction with straight tires',()=>{
  const p={x:0,y:0,heading:0};const q=advance(p,2,0,3);
  near(q.x,6);near(q.y,0);near(q.heading,0);
  const reverse=advance(p,-2,0,3);near(reverse.x,-6);
});
test('right steering rotates clockwise forward and reverses its rotation in reverse',()=>{
  const p={x:0,y:0,heading:0};
  assert.ok(advance(p,1,CAR.maxWheel,1).heading>0);
  assert.ok(advance(p,-1,CAR.maxWheel,1).heading<0);
});
test('bicycle integration is independent of frame division and reversible',()=>{
  const p={x:8,y:10,heading:1};let q={...p};
  for(let i=0;i<100;i++)q=advance(q,1.5,4,.01);
  const full=advance(p,1.5,4,1);near(q.x,full.x);near(q.y,full.y);near(q.heading,full.heading);
  const back=advance(full,-1.5,4,1);near(back.x,p.x);near(back.y,p.y);near(back.heading,p.heading);
});
test('oriented collision detects overlapping and separated cars',()=>{
  const a=corners({x:0,y:0,heading:Math.PI/4});
  assert.ok(overlaps(a,corners({x:1,y:0,heading:-Math.PI/4})));
  assert.ok(!overlaps(a,corners({x:10,y:0,heading:0})));
});
