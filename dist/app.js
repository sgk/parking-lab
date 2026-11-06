import { CAR, advance, dragInput } from './physics.js';
import { DEFAULT_LAYOUT, createLayout, isBlocked, isParked } from './layout.js';

const $ = id => document.getElementById(id);
const canvas = $('scene'), ctx = canvas.getContext('2d');
let layout = createLayout();
let mapCenter = {x:24,y:16.8};
let car, wheel=0, speed=0, drag=null, mode='map', trace=[], lastTime=0, lastTrace=null, collision=false, parkedOk=false;
function reset() {
  car={...layout.start};wheel=0;speed=0;drag=null;trace=[];lastTrace=null;collision=false;parkedOk=false;
  mapCenter={x:car.x,y:car.y};
  updateReadout();
}
function stop() {speed=0;drag=null;}
function setMode(next) {
  stop();mode=next;mapCenter={x:car.x,y:car.y};
  for(const [id,value] of [['map-mode','map'],['car-mode','car']]) {
    $(id).classList.toggle('selected',value===mode);$(id).setAttribute('aria-pressed',String(value===mode));
  }
}
$('map-mode').onclick=()=>setMode('map');$('car-mode').onclick=()=>setMode('car');
$('reset').onclick=reset;$('center').onclick=()=>{stop();wheel=0;};
$('recenter').onclick=()=>{stop();mapCenter={x:car.x,y:car.y};};
$('help').onclick=()=>{stop();$('help-dialog').showModal();};
function syncDimensions() {
  for(const key of Object.keys(DEFAULT_LAYOUT))$(key).value=layout[key].toFixed(1);
}
$('layout-form').onsubmit=e=>{
  e.preventDefault();
  if(!$('layout-form').reportValidity())return;
  const settings=Object.fromEntries(Object.keys(DEFAULT_LAYOUT).map(key=>[key,Number($(key).value)]));
  layout=createLayout(settings);reset();syncDimensions();
};
$('layout-defaults').onclick=()=>{layout=createLayout();reset();syncDimensions();};
syncDimensions();
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('blur',stop);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('pointerdown',e=>{
  if(e.target.closest('button, a, input, label, dialog'))return;
  if(drag || (e.pointerType==='mouse' && e.button!==0))return;
  e.preventDefault();canvas.setPointerCapture(e.pointerId);
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0};speed=0;
  const bounds=canvas.getBoundingClientRect();
  wheel=dragInput(e.clientX-bounds.left,0,bounds.width).wheel;
});
document.addEventListener('pointermove',e=>{
  if(!drag || drag.id!==e.pointerId)return;
  drag.dx=e.clientX-drag.x;drag.dy=e.clientY-drag.y;
  const bounds=canvas.getBoundingClientRect();
  const input=dragInput(e.clientX-bounds.left,drag.dy,bounds.width);
  wheel=input.wheel;speed=input.speed;
});
for(const event of ['pointerup','pointercancel','lostpointercapture']) document.addEventListener(event,e=>{if(drag?.id===e.pointerId)stop();});
window.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Escape'){stop();if(e.code==='Space'&&e.target===canvas)e.preventDefault();}});

function blocked(candidate) {
  return isBlocked(candidate,layout);
}
function rearPoints(p) {
  const x=p.x-CAR.rearOffset*Math.cos(p.heading), y=p.y-CAR.rearOffset*Math.sin(p.heading);
  return [-.72,.72].map(offset=>({x:x-offset*Math.sin(p.heading),y:y+offset*Math.cos(p.heading)}));
}
function update(dt) {
  collision=false;
  if(speed!==0) {
    // Small fixed upper bounds prevent tunneling through parked cars.
    const steps=Math.max(1,Math.ceil(dt/.008));
    for(let i=0;i<steps;i++) {
      const candidate=advance(car,speed,wheel,dt/steps);
      if(blocked(candidate)){collision=true;break;}
      car=candidate;
    }
    if(!lastTrace || Math.hypot(car.x-lastTrace.x,car.y-lastTrace.y)>.08) {
      trace.push(rearPoints(car));lastTrace={...car};if(trace.length>3500)trace.shift();
    }
  }
  parkedOk=isParked(car,layout);
  updateReadout();
}
function updateReadout() {
  const actual=collision?0:speed;
  $('gear').textContent=actual>0?'D':actual<0?'R':'N';
  $('speed').textContent=(Math.abs(actual)*3.6).toFixed(1);
  $('throttle').textContent=`${Math.round(Math.abs(speed)/2*100)}%`;
  $('throttle-bar').style.width=`${Math.abs(speed)/2*100}%`;
  const degrees=wheel*180/Math.PI;
  $('wheel-text').textContent=Math.abs(degrees)<.5?'まっすぐ':`${degrees<0?'左':'右'} ${Math.round(Math.abs(degrees))}°`;
  $('tire-text').textContent=`${Math.round(wheel/CAR.maxWheel*36)}°`;
  $('target-distance').textContent=`目的地まで ${Math.hypot(car.x-layout.target.x,car.y-layout.target.y).toFixed(1)}m`;
  $('dash-wheel').setAttribute('transform',`translate(80 61) rotate(${degrees})`);
  const text=collision?'接触しました。反対方向へ動かして離れましょう。':parkedOk?'スペースに収まりました。何度でも練習できます。':drag?'中央線で直進。上下にドラッグして前進・後進。':'横位置でハンドル、上下ドラッグでアクセル';
  if($('status').textContent!==text)$('status').textContent=text;
}
function rect(x,y,w,h,color,r=0) {
  ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();
}
function line(points,color,width=.035,dash=[]) {
  if(points.length<2)return;ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);
  points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.setLineDash([]);
}
function text(t,x,y,size,color,align='center') {ctx.font=`500 ${size}px system-ui,sans-serif`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(t,x,y);}
function tree(x,y,r=1) {
  ctx.save();ctx.shadowColor='#31472a13';ctx.shadowBlur=.3;ctx.shadowOffsetY=.15;
  rect(x-.09,y,.18,r,'#a6ad94',.05);ctx.fillStyle='#c3ceb0';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;ctx.fillStyle='#b5c5a2';ctx.beginPath();ctx.arc(x-r*.23,y-r*.15,r*.64,0,Math.PI*2);ctx.fill();ctx.restore();
}
function drawMap() {
  const {left,right,top,bottom,entrance,bayWidth,bayDepth,aisleWidth,target,bays,parked}=layout;
  rect(-100,-100,200,200,'#e9ede3');
  ctx.strokeStyle='#e1e6d9';ctx.lineWidth=.025;
  ctx.beginPath();for(let x=-10;x<45;x++){ctx.moveTo(x,-10);ctx.lineTo(x,40);}for(let y=-10;y<40;y++){ctx.moveTo(-10,y);ctx.lineTo(45,y);}ctx.stroke();
  rect(left-.5,top-.5,right-left+1,bottom-top+1,'#d6ddce',.45);rect(left,top,right-left,bottom-top,'#f1f2e9',.25);
  rect(left+.1,top+.1,right-left-.2,bayDepth-.1,'#e9ede2',.1);
  rect(target.x-bayWidth/2,top,bayWidth,bayDepth,'#d9e5cf',.1);
  for(let i=0;i<=5;i++) {
    const x=target.x-bayWidth*2.5+i*bayWidth;
    line([{x,y:top},{x,y:entrance}],'#fffefa',.07);
  }
  line([{x:target.x-bayWidth*2.5,y:top},{x:target.x+bayWidth*2.5,y:top}],'#fffefa',.07);
  ctx.strokeStyle='#91ad7d';ctx.lineWidth=.065;ctx.setLineDash([.23,.18]);ctx.strokeRect(target.x-bayWidth/2,top,bayWidth,bayDepth);ctx.setLineDash([]);
  bays.forEach((bay,i)=>{
    rect(bay.x-.52,top+.45,1.04,.16,'#c3cbb9',.04);
    text(i===2?'P':`0${i+1}`,bay.x,entrance+.55,.35,i===2?'#739365':'#a6b19c');
  });
  text('P',target.x,target.y,.9,'#91ad7d');text('ここに駐車',target.x,target.y+1.1,.32,'#85a173');
  const aisleCenter=entrance+aisleWidth/2;
  line([{x:left+1,y:aisleCenter},{x:right-1,y:aisleCenter}],'#dfe4d7',.055,[.5,.5]);
  for(const x of [left+2,right-2]) {
    const y=entrance+aisleWidth*.75;
    line([{x:x+.7,y},{x:x-.7,y}],'#c6cfbc',.08);line([{x:x-.2,y:y-.35},{x:x-.7,y},{x:x-.2,y:y+.35}],'#c6cfbc',.08);
  }
  text('PARKING LAB',target.x,bottom-.55,.26,'#abb6a0');
  for(const x of [left+1,left+(right-left)/3,right-(right-left)/3,right-1]) {tree(x,top-2,.8);tree(x,bottom+2,.8);}
  for(const p of parked)drawCar(p,p.color,false);
}
function drawCar(p,color,active) {
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.heading);
  const steer=active?wheel/CAR.maxWheel*CAR.maxSteer:0;
  for(const x of [-1.3,1.3])for(const y of [-.89,.89]) {
    ctx.save();ctx.translate(x,y);if(x>0)ctx.rotate(steer);rect(-.36,-.14,.72,.28,'#344439',.07);ctx.restore();
  }
  ctx.shadowColor='#283c3033';ctx.shadowBlur=.25;ctx.shadowOffsetY=.12;
  rect(-2.2,-.83,4.4,1.66,color,.34);ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  ctx.strokeStyle=active?'#446c48':'#9ca896';ctx.lineWidth=.035;ctx.stroke();
  rect(-1.43,-.67,2.6,1.34,active?'#a7c994':'#d7dbcf',.32);
  rect(.62,-.61,.55,1.22,active?'#3e6455':'#7e9385',.14);
  rect(-1.42,-.58,.46,1.16,active?'#557767':'#90a093',.12);
  rect(-.8,-.61,1.27,1.22,active?'#c3dda9':'#dfe2d8',.15);
  for(const y of [-.76,.59]){rect(1.91,y,.15,.24,'#f7f6ce',.04);rect(-2.17,y,.1,.22,active&&speed<0?'#f5e9d8':'#bf8270',.03);}
  rect(.67,-1.01,.27,.19,color,.05);rect(.67,.82,.27,.19,color,.05);
  if(active) {
    ctx.save();ctx.rotate(Math.PI/2);ctx.rotate(wheel);
    ctx.fillStyle='#edf3df';ctx.strokeStyle='#294e39';ctx.lineWidth=.065;ctx.beginPath();ctx.arc(0,0,.44,0,Math.PI*2);ctx.fill();ctx.stroke();
    line([{x:-.4,y:-.06},{x:0,y:.07},{x:.4,y:-.06}],'#294e39',.07);line([{x:0,y:.07},{x:0,y:.41}],'#294e39',.07);
    ctx.beginPath();ctx.arc(0,0,.11,0,Math.PI*2);ctx.fillStyle='#294e39';ctx.fill();line([{x:0,y:-.39},{x:0,y:-.3}],'#76a166',.065);ctx.restore();
    line([{x:1.5,y:0},{x:1.77,y:0}],'#56804f',.045);line([{x:1.65,y:-.1},{x:1.77,y:0},{x:1.65,y:.1}],'#56804f',.045);
  }
  ctx.restore();
}
function drawGuide() {
  const paths=[[],[]];let predicted={...car};
  const direction=speed<0?-1:1;
  for(let i=0;i<48;i++) {
    predicted=advance(predicted,direction,wheel,.1);
    if(blocked(predicted))break;
    rearPoints(predicted).forEach((p,j)=>paths[j].push(p));
  }
  paths.forEach(p=>line(p,'#88a47799',.04,[.16,.13]));
}
function render() {
  const bounds=canvas.getBoundingClientRect(), dpr=Math.min(window.devicePixelRatio||1,2);
  const width=Math.round(bounds.width*dpr),height=Math.round(bounds.height*dpr);
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,bounds.width,bounds.height);
  // Leave room for the fixed toolbar and bottom information strip.
  // Fit five car widths across and three car lengths vertically; extra space
  // on wide screens stays visible without stretching the vehicle.
  const scale=Math.min(bounds.width/(CAR.width*5),(bounds.height-100)/(CAR.length*3));
  const centerX=bounds.width/2,centerY=57+(bounds.height-115)/2;
  ctx.save();ctx.translate(centerX,centerY);ctx.scale(scale,scale);
  if(mode==='car'){ctx.rotate(-Math.PI/2-car.heading);ctx.translate(-car.x,-car.y);}
  else ctx.translate(-mapCenter.x,-mapCenter.y);
  drawMap();
  if($('trail').checked)for(let j=0;j<2;j++)line(trace.map(t=>t[j]),'#7c9f6c88',.045,[.1,.12]);
  if($('guide').checked)drawGuide();
  drawCar(car,'#a2c484',true);
  // Both endpoints are world-space centers, so the line remains attached
  // in the fixed-map and fixed-car camera modes.
  line([car,layout.target],'#fffaf1cc',.15);
  line([car,layout.target],'#d2763f',.075);
  for(const p of [car,layout.target]) {
    ctx.beginPath();ctx.arc(p.x,p.y,.1,0,Math.PI*2);ctx.fillStyle='#d2763f';ctx.fill();
  }
  ctx.restore();
  ctx.save();ctx.strokeStyle='#426a5480';ctx.lineWidth=1;ctx.setLineDash([6,6]);
  ctx.beginPath();ctx.moveTo(centerX,60);ctx.lineTo(centerX,bounds.height-93);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#f7f9f0e8';ctx.beginPath();ctx.roundRect(centerX-34,bounds.height-94,68,20,5);ctx.fill();
  text('直進 · 0°',centerX,bounds.height-84,10,'#55734b');ctx.restore();
  if(drag && Math.hypot(drag.dx,drag.dy)>2) {
    const x=drag.x-bounds.left,y=drag.y-bounds.top;
    ctx.save();ctx.strokeStyle='#547c5599';ctx.fillStyle='#547c5518';ctx.lineWidth=1;ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.arc(x,y,17,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+drag.dx,y+drag.dy);ctx.stroke();ctx.setLineDash([]);
    ctx.beginPath();ctx.arc(x+drag.dx,y+drag.dy,6,0,Math.PI*2);ctx.fillStyle='#547c55bb';ctx.fill();ctx.restore();
  }
}
function frame(time){const dt=lastTime?Math.min((time-lastTime)/1000,.05):0;lastTime=time;update(dt);render();requestAnimationFrame(frame);}
reset();requestAnimationFrame(frame);
