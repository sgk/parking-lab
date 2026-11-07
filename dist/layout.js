import { corners, overlaps } from './physics.js';

export const DEFAULT_LAYOUT = { bayWidth: 3.4, bayDepth: 7, aisleWidth: 11.2 };
export const DIMENSION_LIMITS = { bayWidth: [2.2, 4], bayDepth: [4.8, 8], aisleWidth: [3, 12] };
const compact={bayWidth:2.7,bayDepth:5.5,aisleWidth:6};
export const SCENARIOS = [
  {id:'standard',title:'直角駐車・向き自由',category:'基本',kind:'perpendicular',rule:'either',defaults:DEFAULT_LAYOUT,description:'広い通路で、ハンドルと車の動きを確認。前向き・バックのどちらでも成功です。'},
  {id:'reverse',title:'バック駐車指定',category:'基本',kind:'perpendicular',rule:'reverse',defaults:compact,description:'車の前を通路側へ向けて駐車。後輪の軌跡と、外へ振れる車の前側を見てみましょう。'},
  {id:'forward',title:'前向き駐車指定',category:'基本',kind:'perpendicular',rule:'forward',defaults:compact,description:'車の前を奥の壁側へ向けて駐車。内側の後輪と、隣の車との間隔に注目。'},
  {id:'parallel-left',title:'左側への縦列駐車',category:'応用',kind:'parallel',rule:'aligned',defaults:{bayWidth:2.4,bayDepth:6.5,aisleWidth:5.5},description:'右向きに走行する車から見て左側の空き枠へ。前後の車の間に、同じ向きで停めます。'},
  {id:'parallel-right',title:'右側への縦列駐車',category:'応用',kind:'parallel',rule:'aligned',defaults:{bayWidth:2.4,bayDepth:6.5,aisleWidth:5.5},description:'左向きに走行する車から見て右側の空き枠へ。左右の切り返しの違いを比べましょう。'},
  {id:'dead-end-left',title:'行き止まり・左端の枠',category:'難しめ',kind:'perpendicular',rule:'reverse',defaults:{bayWidth:2.7,bayDepth:5.5,aisleWidth:5.5},description:'左の壁ぎわが目標。通路も左端で行き止まりです。奥へ進みすぎる前に、バックで入れる位置を探そう。'},
  {id:'dead-end-right',title:'行き止まり・右端の枠',category:'難しめ',kind:'perpendicular',rule:'reverse',defaults:{bayWidth:2.7,bayDepth:5.5,aisleWidth:5.5},description:'右の壁ぎわが目標。通路も右端で行き止まりです。反対向きのアプローチで練習できます。'},
  {id:'narrow',title:'狭い通路でバック駐車',category:'難しめ',kind:'perpendicular',rule:'reverse',defaults:{bayWidth:2.5,bayDepth:5.2,aisleWidth:4.5},description:'前側を大きく振れない狭い通路。無理に一度で入れず、切り返しを試しましょう。'},
  {id:'opposing',title:'向かいにも車がある駐車場',category:'応用',kind:'perpendicular',rule:'reverse',defaults:{bayWidth:2.7,bayDepth:5.5,aisleWidth:5.5},description:'通路の反対側にも駐車車両があります。前側が振れる範囲を見ながらバック駐車。'},
  {id:'angled',title:'斜めの駐車枠',category:'応用',kind:'angled',rule:'forward',defaults:{bayWidth:2.8,bayDepth:5.5,aisleWidth:6},description:'60°に傾いた枠へ前向きに駐車。直角の枠と必要なハンドル操作を比べてみましょう。'}
];
export function getScenario(id) {
  const scenario=SCENARIOS.find(item=>item.id===id);
  if(!scenario)throw new RangeError(`Unknown parking scenario: ${id}`);
  return scenario;
}

export function createLayout(settings = DEFAULT_LAYOUT, scenarioId = 'standard') {
  const scenario=getScenario(scenarioId);
  for (const [key, [min, max]] of Object.entries(DIMENSION_LIMITS)) {
    if (!Number.isFinite(settings[key]) || settings[key] < min || settings[key] > max) throw new RangeError(`${key}: ${min}〜${max}mの範囲で指定してください。`);
  }
  const {bayWidth,bayDepth,aisleWidth}=settings,top=3.8,rowCenter=17;
  const parallel=scenario.kind==='parallel',angled=scenario.kind==='angled';
  const heading=parallel?(scenarioId==='parallel-right'?Math.PI:0):(scenario.rule==='reverse'?Math.PI/2:angled?-Math.PI/3:-Math.PI/2);
  const pitch=parallel?bayDepth:angled?bayWidth/Math.sin(Math.PI/3):bayWidth;
  const rowHeight=parallel?bayWidth:angled?bayDepth*Math.sin(Math.PI/3)+bayWidth*.5:bayDepth;
  const count=parallel?3:5,entrance=top+rowHeight;
  const targetIndex=scenarioId==='dead-end-left'?0:scenarioId==='dead-end-right'?count-1:Math.floor(count/2);
  const bays=Array.from({length:count},(_,index)=>({x:rowCenter+(index-(count-1)/2)*pitch,y:top+rowHeight/2,heading,length:bayDepth,width:bayWidth,row:0,isTarget:index===targetIndex}));
  const target={x:bays[targetIndex].x,y:bays[targetIndex].y,heading};
  const targetBox={...target,length:bayDepth,width:bayWidth};
  const rowShape=bays.flatMap(bay=>corners(bay,bayDepth,bayWidth));
  let left=Math.min(...rowShape.map(p=>p.x))-3,right=Math.max(...rowShape.map(p=>p.x))+3;
  if(scenarioId==='dead-end-left')left=Math.min(...rowShape.map(p=>p.x))-.3;
  if(scenarioId==='dead-end-right')right=Math.max(...rowShape.map(p=>p.x))+.3;
  let bottom=entrance+aisleWidth;
  if(scenarioId==='opposing'){
    bays.push(...Array.from({length:5},(_,index)=>({x:rowCenter+(index-2)*bayWidth,y:bottom+bayDepth/2,heading:-Math.PI/2,length:bayDepth,width:bayWidth,row:1,isTarget:false})));
    bottom+=bayDepth;
  }
  const colors=['#b7bcb3','#e3d9c6','#a2b3ae','#c3c6b8'];
  const parked=bays.filter(bay=>!bay.isTarget).map((bay,index)=>({x:bay.x,y:bay.y,heading:bay.heading,color:colors[index%colors.length]}));
  const startY=entrance+aisleWidth/2+.4;
  let start={x:rowCenter+Math.min(7,bayWidth*2),y:startY,heading:Math.PI};
  if(parallel)start={x:rowCenter+(scenarioId==='parallel-right'?-bayDepth:bayDepth),y:entrance+aisleWidth/2,heading};
  if(scenarioId==='dead-end-right')start={x:rowCenter-Math.min(7,bayWidth*2),y:startY,heading:0};
  if(angled)start={x:rowCenter-Math.min(7,bayWidth*2),y:startY,heading:0};
  return {...settings,scenarioId,scenario,top,entrance,bottom,left,right,bays,parked,target,targetBox,start,targetIndex,directed:scenario.rule!=='either'};
}

export function isBlocked(car, layout) {
  const shape=corners(car);
  if(shape.some(p=>p.x<layout.left||p.x>layout.right||p.y<layout.top||p.y>layout.bottom))return true;
  return layout.parked.some(p=>overlaps(shape,corners(p)));
}
export function isParked(car, layout) {
  const box=layout.targetBox,c=Math.cos(box.heading),s=Math.sin(box.heading);
  return corners(car).every(p=>Math.abs((p.x-box.x)*c+(p.y-box.y)*s)<box.length/2 && Math.abs(-(p.x-box.x)*s+(p.y-box.y)*c)<box.width/2);
}
export function targetAlignment(car, layout) {
  const dx=car.x-layout.target.x,dy=car.y-layout.target.y,c=Math.cos(layout.target.heading),s=Math.sin(layout.target.heading);
  const cosine=Math.cos(car.heading-layout.target.heading);
  return {longitudinal:Math.abs(dx*c+dy*s),lateral:Math.abs(-dx*s+dy*c),angle:Math.acos(Math.max(-1,Math.min(1,layout.directed?cosine:Math.abs(cosine))))};
}
export function isAtTarget(car, layout) {
  const alignment=targetAlignment(car,layout);
  return alignment.lateral<=.2 && alignment.longitudinal<=.35 && alignment.angle<=8*Math.PI/180 && isParked(car,layout) && !isBlocked(car,layout);
}
