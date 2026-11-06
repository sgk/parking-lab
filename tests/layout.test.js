import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR } from '../dist/physics.js';
import { createLayout, DEFAULT_LAYOUT, DIMENSION_LIMITS, isBlocked, isParked, isAtTarget } from '../dist/layout.js';

test('all combinations of dimension extremes have safe starting and parking positions',()=>{
  for(const bayWidth of DIMENSION_LIMITS.bayWidth)for(const bayDepth of DIMENSION_LIMITS.bayDepth)for(const aisleWidth of DIMENSION_LIMITS.aisleWidth){
    const layout=createLayout({bayWidth,bayDepth,aisleWidth});
    assert.equal(isBlocked(layout.start,layout),false);
    assert.equal(isBlocked(layout.target,layout),false);
    assert.equal(isParked(layout.target,layout),true);
    assert.equal(isParked(layout.start,layout),false);
    assert.ok(Math.abs(layout.bottom-layout.entrance-aisleWidth)<1e-8);
    assert.ok(Math.abs(layout.entrance-layout.top-bayDepth)<1e-8);
    assert.equal(layout.parked.length,4);
    assert.ok(Math.abs(layout.bays[3].x-layout.bays[2].x-bayWidth)<1e-8);
  }
});
test('changed aisle boundaries and bay widths control collision and completion',()=>{
  const narrow=createLayout({bayWidth:2.2,bayDepth:5,aisleWidth:3});
  const wide=createLayout({bayWidth:4,bayDepth:5,aisleWidth:8});
  const outside={x:17,y:narrow.bottom,heading:0};
  assert.equal(isBlocked(outside,narrow),true);assert.equal(isBlocked(outside,wide),false);
  const offset={...narrow.target,x:17+.4};
  assert.equal(isParked(offset,narrow),false);assert.equal(isParked(offset,wide),true);
  assert.equal(isBlocked(narrow.parked[0],narrow),true);
  assert.ok(CAR.length<narrow.bayDepth);
});
test('invalid dimensions stop rather than substituting a different layout',()=>{
  for(const value of [NaN,Infinity,0,20])assert.throws(()=>createLayout({...DEFAULT_LAYOUT,bayWidth:value}),RangeError);
});

test('success requires close center alignment and a nearly parallel heading',()=>{
  const layout=createLayout();const target=layout.target;
  assert.equal(isAtTarget(target,layout),true);
  assert.equal(isAtTarget({...target,heading:target.heading+Math.PI},layout),true);
  assert.equal(isAtTarget({...target,heading:target.heading+4*Math.PI+.05},layout),true);
  assert.equal(isAtTarget({...target,x:target.x+.15,y:target.y+.3,heading:target.heading+.05},layout),true);
  for(const car of [{...target,x:target.x+.25},{...target,y:target.y+.4},{...target,heading:target.heading+9*Math.PI/180}]) {
    assert.equal(isParked(car,layout),true,'merely fitting into the bay is insufficient');
    assert.equal(isAtTarget(car,layout),false);
  }
  for(const bayWidth of DIMENSION_LIMITS.bayWidth)for(const bayDepth of DIMENSION_LIMITS.bayDepth){
    const variant=createLayout({...DEFAULT_LAYOUT,bayWidth,bayDepth});assert.equal(isAtTarget(variant.target,variant),true);
  }
});
