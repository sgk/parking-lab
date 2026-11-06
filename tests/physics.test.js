import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR, advance, corners, overlaps, dragInput } from '../dist/physics.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('absolute horizontal position controls steering; a tap leaves speed zero',()=>{
  near(dragInput(200,0,400).wheel,0);
  near(dragInput(0,0,400).wheel,-CAR.maxWheel);
  near(dragInput(400,0,400).wheel,CAR.maxWheel);
  near(dragInput(100,0,400).wheel,-CAR.maxWheel/2);
  near(dragInput(300,0,400).wheel,CAR.maxWheel/2);
  near(dragInput(400,0,400).speed,0);
  near(dragInput(100,0,200).wheel,0);
});
test('vertical drag preserves proportional speed, with bounded steering and speed',()=>{
  near(dragInput(200,-50,400).speed,1);near(dragInput(200,50,400).speed,-1);
  near(dragInput(1000,-1000,400).wheel,CAR.maxWheel);
  near(dragInput(-1000,1000,400).wheel,-CAR.maxWheel);
  near(dragInput(200,-1000,400).speed,2);near(dragInput(200,1000,400).speed,-2);
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
