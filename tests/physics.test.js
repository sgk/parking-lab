import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR, STEERING_DEAD_ZONE, ACCEL_DEAD_ZONE, advance, corners, overlaps, createControlBasis, pointerInput } from '../dist/physics.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
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

test('absolute car-relative positions have independent stop and straight bands in every orientation',()=>{
  for(const [width,height] of [[320,600],[393,852],[1280,600]])for(const heading of [-Math.PI/2,0,Math.PI/2,Math.PI,Math.PI/4]){
    const origin={x:width/2,y:height/2},basis=createControlBasis(origin,heading,width,height);
    const point=(forward,right)=>({x:origin.x+basis.forward.x*forward+basis.right.x*right,y:origin.y+basis.forward.y*forward+basis.right.y*right});
    const input=(f,r)=>pointerInput(point(f,r),basis);
    for(const offset of [-1,0,1]){
      assert.equal(input(offset*basis.forwardSpan*ACCEL_DEAD_ZONE,0).speed,0);
      assert.equal(input(0,offset*basis.span*STEERING_DEAD_ZONE).wheel,0);
    }
    near(input(basis.forwardSpan/2,0).speed,2);near(input(-basis.forwardSpan/2,0).speed,-2);
    near(input(0,basis.span/2).wheel,CAR.maxWheel);near(input(0,-basis.span/2).wheel,-CAR.maxWheel);
    near(input(basis.forwardSpan*.275,basis.span*.275).speed,1);
    near(input(basis.forwardSpan*.275,basis.span*.275).wheel,CAR.maxWheel/2);
    assert.ok(input(basis.forwardSpan*ACCEL_DEAD_ZONE+.01,0).speed>0);
    assert.ok(input(-basis.forwardSpan*ACCEL_DEAD_ZONE-.01,0).speed<0);
    assert.ok(input(basis.forwardSpan*ACCEL_DEAD_ZONE+.0001,0).speed<.00001);
    near(input(basis.forwardSpan*5,-basis.span*5).speed,2);
    near(input(-basis.forwardSpan*5,basis.span*5).speed,-2);
    assert.equal(input(0,basis.span*.4).speed,0,'steering alone must not creep');
  }
});
