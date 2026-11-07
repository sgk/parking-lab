import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR } from '../dist/physics.js';
import { createLayout, DEFAULT_LAYOUT, DIMENSION_LIMITS, SCENARIOS, isBlocked, isParked, isAtTarget } from '../dist/layout.js';

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

test('all scenarios and dimension extremes have safe starts and valid target poses',()=>{
  for(const scenario of SCENARIOS)for(const bayWidth of DIMENSION_LIMITS.bayWidth)for(const bayDepth of DIMENSION_LIMITS.bayDepth)for(const aisleWidth of DIMENSION_LIMITS.aisleWidth){
    const layout=createLayout({bayWidth,bayDepth,aisleWidth},scenario.id);
    assert.equal(isBlocked(layout.start,layout),false,`${scenario.id}: initial position intersects a wall or parked car`);
    assert.equal(isBlocked(layout.target,layout),false,`${scenario.id}: target intersects an obstacle`);
    assert.equal(isAtTarget(layout.target,layout),true,`${scenario.id}: target must be achievable`);
    assert.equal(isAtTarget({...layout.target,heading:layout.target.heading+Math.PI},layout),!layout.directed,`${scenario.id}: required heading must be enforced`);
    assert.equal(layout.bays.filter(bay=>bay.isTarget).length,1);
  }
});

test('scenario geometry represents parallel bays, end walls, opposing rows and angled spaces',()=>{
  const parallel=createLayout(SCENARIOS.find(s=>s.id==='parallel-left').defaults,'parallel-left');
  assert.equal(parallel.bays.length,3);assert.equal(parallel.parked.length,2);
  assert.equal(parallel.target.heading,0);
  assert.equal(isParked({...parallel.target,x:parallel.target.x+.2},parallel),true);
  const left=createLayout(DEFAULT_LAYOUT,'dead-end-left'),right=createLayout(DEFAULT_LAYOUT,'dead-end-right');
  assert.equal(left.targetIndex,0);assert.equal(right.targetIndex,4);
  assert.ok(Math.abs(left.target.x-left.bayWidth/2-left.left-.3)<1e-8);
  assert.ok(Math.abs(right.right-right.target.x-right.bayWidth/2-.3)<1e-8);
  const opposing=createLayout(DEFAULT_LAYOUT,'opposing');
  assert.equal(opposing.parked.length,9);assert.equal(opposing.bays.filter(bay=>bay.row===1).length,5);
  assert.equal(isBlocked(opposing.parked.at(-1),opposing),true);
  const angled=createLayout(DEFAULT_LAYOUT,'angled');
  assert.equal(angled.target.heading,-Math.PI/3);assert.equal(isAtTarget(angled.target,angled),true);
  assert.throws(()=>createLayout(DEFAULT_LAYOUT,'missing'),RangeError);
});
