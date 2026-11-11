import { CAR, STEERING_DEAD_ZONE, CREEP_SPEED, ACCEL_DRAG_THRESHOLD, advance, corners, createControlBasis, pointerInput } from './physics.js?v=car-relative-1';
import { DEFAULT_LAYOUT, DIMENSION_LIMITS, SCENARIOS, getScenario, createLayout, isBlocked, isParked, isAtTarget, targetAlignment } from './layout.js?v=scenarios-1';
import { createCollisionSound } from './sound.js?v=signal-1';
import { mapCards } from './thumbnails.js?v=gallery-1';

const $ = id => document.getElementById(id);
const canvas = $('scene'), ctx = canvas.getContext('2d');
let latestSoundId=0;
const collisionSound = createCollisionSound(window.AudioContext, message => {
  $('sound-status').hidden=false;$('sound-status').textContent=message;
}, event => {
  if(event.id<latestSoundId)return;latestSoundId=event.id;
  const label=event.kind==='collision'?'衝突音':'成功音';
  const messages={scheduled:'再生を予約しました',signal:'音声の波形を確認しました',paused:'音声処理が停止しました','not-observed':'音声の波形を確認できませんでした',failed:'音声を開始できませんでした'};
  $('sound-signal').textContent=`${label}：${messages[event.phase]}`;
});
let contactPosition=null, audioReady=false, gestureVersion=0;
let layout = createLayout();
let mapCenter = {x:24,y:16.8}, overview=false, activeScreen='maps', galleryScroll=0;
let car, wheel=0, speed=0, drag=null, mode='car', trace=[], lastTime=0, lastTrace=null, collision=false, parkedOk=false, successCelebrated=false;
function reset() {
  car={...layout.start};wheel=0;speed=0;drag=null;trace=[];lastTrace=null;collision=false;parkedOk=false;
  mapCenter={x:car.x,y:car.y};
  contactPosition=null;successCelebrated=false;gestureVersion++;
  syncScenario();updateReadout();
}
function stop() {speed=0;drag=null;gestureVersion++;}
function setMode(next) {
  stop();mode=next;overview=false;mapCenter={x:car.x,y:car.y};
  for(const [id,value] of [['map-mode','map'],['car-mode','car']]) {
    $(id).classList.toggle('selected',value===mode);$(id).setAttribute('aria-pressed',String(value===mode));
  }
  syncScenario();
}
function syncScenario() {
  const scenario=layout.scenario;
  $('scenario-title').textContent=scenario.title;
  $('scenario-description').textContent=scenario.description;
  $('scenario-category').textContent=scenario.category;
  $('scenario-rule').textContent=({either:'前向き・バック自由',reverse:'バック駐車指定',forward:'前向き駐車指定',aligned:'進行方向と同じ向き'})[scenario.rule];
  $('practice-name').textContent=scenario.title;$('practice-number').textContent=String(SCENARIOS.indexOf(scenario)+1).padStart(2,'0');
  $('bayDepth-label').textContent=scenario.kind==='parallel'?'縦列枠の長さ':'駐車ロットの奥行き';
  $('overview').textContent=overview?'全体図を閉じる':'全体図を見る';$('overview').setAttribute('aria-pressed',String(overview));
  const relative=mode==='map'||overview;
  canvas.setAttribute('aria-label',relative?'真上から見た駐車場。押した瞬間の車の前後・左右を基準に運転します。':'真上から見た駐車場。横位置でハンドル角度を決め、上下にドラッグして運転します。');
  $('accel-instruction').textContent=relative?'車の前へドラッグで前進、後ろへドラッグで後進。':'上下ドラッグで速度を調整。上で前進、下で後進。';
  $('steer-instruction').textContent=relative?'車から見た左右の位置で操作。直進エリア内はまっすぐ。':'中央の直進エリア内はまっすぐ。左右端で最大角度。';
}
function changeScenario(id) {
  const scenario=getScenario(id);layout=createLayout({...scenario.defaults},id);reset();syncDimensions();
}
$('map-gallery').innerHTML=mapCards(SCENARIOS,createLayout);
$('map-gallery').onclick=event=>{
  const card=event.target.closest('button[data-scenario]');
  if(!card)return;
  getScenario(card.dataset.scenario);galleryScroll=window.scrollY;
  window.location.hash=`#play/${card.dataset.scenario}`;
};
$('back-to-maps').onclick=()=>{window.location.hash='#maps';};
function showMapSelection(error='') {
  activeScreen='maps';$('map-screen').hidden=false;$('play-screen').hidden=true;
  $('route-error').hidden=!error;$('route-error').textContent=error;
  document.title='車庫入れラボ — マップを選ぶ';
  window.scrollTo(0,galleryScroll);$('maps-heading').focus({preventScroll:true});
}
function applyRoute() {
  stop();
  const hash=window.location.hash;
  if(!hash||hash==='#maps'){showMapSelection();return;}
  const match=hash.match(/^#play\/([a-z-]+)$/);
  if(!match||!SCENARIOS.some(scenario=>scenario.id===match[1])){
    showMapSelection('このマップは見つかりません。一覧のサムネイルから選んでください。');return;
  }
  activeScreen='play';$('map-screen').hidden=true;$('play-screen').hidden=false;
  overview=false;changeScenario(match[1]);setMode('car');
  document.title=`${layout.scenario.title} — 車庫入れラボ`;
  window.scrollTo(0,0);$('scenario-title').focus({preventScroll:true});
}
window.addEventListener('hashchange',applyRoute);
$('overview').onclick=()=>{stop();overview=!overview;syncScenario();};
$('map-mode').onclick=()=>setMode('map');$('car-mode').onclick=()=>setMode('car');
$('reset').onclick=reset;$('center').onclick=()=>{stop();wheel=0;};
$('recenter').onclick=()=>{stop();overview=false;mapCenter={x:car.x,y:car.y};syncScenario();};
$('help').onclick=()=>{stop();$('help-dialog').showModal();};
async function playEffect(kind, label=kind==='success'?'成功音':'衝突音') {
  const played=await collisionSound.play(kind);
  $('sound-status').hidden=false;
  $('sound-status').textContent=played?`${label}の再生を開始しました。`:`${label}を再生できませんでした。「音をテスト」で確認してください。`;
  return played;
}
async function enableSound() {
  stop();$('sound-test').disabled=true;$('sound-start').disabled=true;
  const ready=await playEffect('success','テスト音');
  $('sound-test').disabled=false;$('sound-start').disabled=false;$('sound-status').hidden=false;
  if(ready){
    audioReady=true;contactPosition=null;$('sound-gate').hidden=true;
  } else if(!$('sound-status').textContent) {
    $('sound-status').textContent='音声が停止しています。ブラウザの音声設定を確認して再読み込みしてください。';
  }
  $('sound-start-status').textContent=ready?'':$('sound-status').textContent;
}
$('sound-test').onclick=enableSound;$('sound-start').onclick=enableSound;
$('collision-test').onclick=()=>{stop();return playEffect('collision','衝突テスト音');};
function syncDimensions() {
  for(const key of Object.keys(DEFAULT_LAYOUT)){
    $(key).value=layout[key].toFixed(1);updateDimensionButtons(key);
  }
}
function updateDimensionButtons(key) {
  const value=Number($(key).value), [min,max]=DIMENSION_LIMITS[key];
  $(`${key}-minus`).disabled=value<=min;$(`${key}-plus`).disabled=value>=max;
}
for(const key of Object.keys(DEFAULT_LAYOUT)) {
  $(key).oninput=()=>updateDimensionButtons(key);
  for(const [suffix,direction] of [['minus',-1],['plus',1]]) {
    $(`${key}-${suffix}`).onclick=()=>{
      const input=$(key);
      if(!input.reportValidity())return;
      const [min,max]=DIMENSION_LIMITS[key];
      input.value=(Math.max(min*10,Math.min(max*10,Math.round(Number(input.value)*10)+direction))/10).toFixed(1);
      updateDimensionButtons(key);
    };
  }
}
$('layout-form').onsubmit=e=>{
  e.preventDefault();
  if(!$('layout-form').reportValidity())return;
  const settings=Object.fromEntries(Object.keys(DEFAULT_LAYOUT).map(key=>[key,Number($(key).value)]));
  layout=createLayout(settings,layout.scenarioId);reset();syncDimensions();
};
$('layout-defaults').onclick=()=>{layout=createLayout({...layout.scenario.defaults},layout.scenarioId);reset();syncDimensions();};
syncDimensions();
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});window.addEventListener('blur',stop);
canvas.addEventListener('contextmenu',e=>e.preventDefault());
function cameraView(bounds) {
  const scale=overview?Math.min((bounds.width-30)/(layout.right-layout.left+2),(bounds.height-125)/(layout.bottom-layout.top+2)):Math.min(bounds.width/(CAR.width*5),(bounds.height-100)/(CAR.length*3));
  const centerX=bounds.width/2,centerY=57+(bounds.height-115)/2;
  const rotation=mode==='car'&&!overview?-Math.PI/2-car.heading:0;
  const worldCenter=overview?{x:(layout.left+layout.right)/2,y:(layout.top+layout.bottom)/2}:mode==='car'?car:mapCenter;
  const dx=car.x-worldCenter.x,dy=car.y-worldCenter.y;
  return {scale,centerX,centerY,rotation,worldCenter,carX:centerX+scale*(dx*Math.cos(rotation)-dy*Math.sin(rotation)),carY:centerY+scale*(dx*Math.sin(rotation)+dy*Math.cos(rotation))};
}
function currentControlBasis(bounds) {
  const view=cameraView(bounds);
  return createControlBasis({x:bounds.left+view.carX,y:bounds.top+view.carY},car.heading+view.rotation,bounds.width,bounds.height);
}
document.addEventListener('pointerdown',e=>{
  if(e.target.closest('button, a, input, select, option, label, dialog'))return;
  if(activeScreen!=='play' || !audioReady || drag || (e.pointerType==='mouse' && e.button!==0))return;
  contactPosition=null;successCelebrated=false;parkedOk=false;gestureVersion++;
  e.preventDefault();canvas.setPointerCapture(e.pointerId);
  const bounds=canvas.getBoundingClientRect();
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0,accelDrag:false,basis:currentControlBasis(bounds)};speed=CREEP_SPEED;
  wheel=pointerInput({x:e.clientX,y:e.clientY},drag,drag.basis).wheel;
});
document.addEventListener('pointermove',e=>{
  if(!drag || drag.id!==e.pointerId)return;
  drag.dx=e.clientX-drag.x;drag.dy=e.clientY-drag.y;
  const input=pointerInput({x:e.clientX,y:e.clientY},drag,drag.basis);
  if(Math.abs(input.forwardDrag)>ACCEL_DRAG_THRESHOLD)drag.accelDrag=true;
  wheel=input.wheel;speed=drag.accelDrag?input.speed:CREEP_SPEED;
});
for(const event of ['pointerup','pointercancel','lostpointercapture']) document.addEventListener(event,async e=>{
  if(drag?.id!==e.pointerId)return;
  stop();
  if(event!=='pointerup')return;
  await completeParking();
});
window.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Escape'){stop();if(e.code==='Space'&&e.target===canvas)e.preventDefault();}});

function blocked(candidate) {
  return isBlocked(candidate,layout);
}
function rearPoints(p) {
  const x=p.x-CAR.rearOffset*Math.cos(p.heading), y=p.y-CAR.rearOffset*Math.sin(p.heading);
  return [-.72,.72].map(offset=>({x:x-offset*Math.sin(p.heading),y:y+offset*Math.cos(p.heading)}));
}
async function completeParking() {
  parkedOk=!drag && speed===0 && !blocked(car) && isAtTarget(car,layout);
  if(parkedOk && !successCelebrated){
    const releasedVersion=gestureVersion;
    const played=await playEffect('success');
    if(releasedVersion===gestureVersion)successCelebrated=played;
  }
  updateReadout();
}
function update(dt) {
  collision=false;
  if(speed!==0) {
    // Small fixed upper bounds prevent tunneling through parked cars.
    const steps=Math.max(1,Math.ceil(dt/.008));
    for(let i=0;i<steps;i++) {
      const candidate=advance(car,speed,wheel,dt/steps);
      if(blocked(candidate)){
        collision=true;
        if(!contactPosition){contactPosition={x:car.x,y:car.y};void playEffect('collision');}
        break;
      }
      car=candidate;
      // Suppress repeated sounds within one drag, until moving clear.
      if(contactPosition && Math.hypot(car.x-contactPosition.x,car.y-contactPosition.y)>.08)contactPosition=null;
    }
    if(!lastTrace || Math.hypot(car.x-lastTrace.x,car.y-lastTrace.y)>.08) {
      trace.push(rearPoints(car));lastTrace={...car};if(trace.length>3500)trace.shift();
    }
  }
  // Only a real release judges success in completeParking(). A cancelled
  // gesture or blur must not show success without requesting its sound.
  if(drag || speed!==0 || collision || !isAtTarget(car,layout))parkedOk=false;
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
  const wrongHeading=layout.directed && !drag && speed===0 && isParked(car,layout) && targetAlignment(car,layout).angle>8*Math.PI/180;
  const drivingHint=mode==='map'||overview?'車の前後へドラッグで前進・後進。左右も車を基準に操作。':'直進エリア内はまっすぐ。上下ドラッグで前進・後進。';
  const text=collision?'接触しました。反対方向へ動かして離れましょう。':parkedOk?'駐車成功！ きれいに停められました。':wrongHeading?'車の前向きを、点線枠の矢印に合わせましょう。':drag?drivingHint:'点線の車形に合わせて、停めてみましょう';
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
  const {left,right,top,bottom,entrance,aisleWidth,target,bays,parked}=layout;
  rect(-100,-100,200,200,'#e9ede3');
  ctx.strokeStyle='#e1e6d9';ctx.lineWidth=.025;
  ctx.beginPath();for(let x=-10;x<60;x++){ctx.moveTo(x,-10);ctx.lineTo(x,50);}for(let y=-10;y<50;y++){ctx.moveTo(-10,y);ctx.lineTo(60,y);}ctx.stroke();
  rect(left-.4,top-.4,right-left+.8,bottom-top+.8,'#d6ddce',.4);
  rect(left,top,right-left,bottom-top,'#f1f2e9',.2);
  bays.forEach((bay,index)=>{
    const shape=corners(bay,bay.length,bay.width);
    ctx.beginPath();shape.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
    ctx.fillStyle=bay.isTarget?'#d9e5cf':'#e6ebdf';ctx.fill();
    ctx.strokeStyle=bay.isTarget?'#91ad7d':'#fffefa';ctx.lineWidth=bay.isTarget?.065:.06;
    if(bay.isTarget)ctx.setLineDash([.23,.18]);ctx.stroke();ctx.setLineDash([]);
    const y=bay.row===0?entrance+.45:entrance+aisleWidth-.45;
    text(bay.isTarget?'P':String(index+1).padStart(2,'0'),bay.x,y,.3,bay.isTarget?'#739365':'#a6b19c');
  });
  text('P',target.x,target.y,.8,'#91ad7d');
  ctx.save();ctx.translate(target.x,target.y);ctx.rotate(target.heading);
  ctx.fillStyle='#b9d8d61f';ctx.fillRect(-CAR.length/2,-CAR.width/2,CAR.length,CAR.width);
  ctx.strokeStyle=parkedOk?'#548d58':'#548590';ctx.lineWidth=.06;ctx.setLineDash([.2,.13]);
  ctx.strokeRect(-CAR.length/2,-CAR.width/2,CAR.length,CAR.width);ctx.setLineDash([]);
  if(layout.directed){
    line([{x:-.6,y:0},{x:1.35,y:0}],'#548590',.07);
    line([{x:.95,y:-.3},{x:1.35,y:0},{x:.95,y:.3}],'#548590',.07);
  }
  ctx.restore();
  const aisleCenter=entrance+aisleWidth/2;
  line([{x:left+.7,y:aisleCenter},{x:right-.7,y:aisleCenter}],'#dfe4d7',.055,[.5,.5]);
  for(const x of [left+1.2,right-1.2]){
    const y=entrance+aisleWidth*.76,direction=Math.cos(layout.start.heading)>0?1:-1;
    line([{x:x-direction*.45,y},{x:x+direction*.45,y}],'#c6cfbc',.08);
    line([{x,y:y-.25},{x:x+direction*.45,y},{x,y:y+.25}],'#c6cfbc',.08);
  }
  const wall='#aab6a1';
  line([{x:left,y:top},{x:right,y:top}],wall,.14);
  line([{x:left,y:bottom},{x:right,y:bottom}],wall,.14);
  line([{x:left,y:top},{x:left,y:bottom}],layout.scenarioId==='dead-end-left'?'#87947d':wall,layout.scenarioId==='dead-end-left'?.25:.12);
  line([{x:right,y:top},{x:right,y:bottom}],layout.scenarioId==='dead-end-right'?'#87947d':wall,layout.scenarioId==='dead-end-right'?.25:.12);
  for(const x of [left+1,right-1]){tree(x,top-1.5,.65);tree(x,bottom+1.5,.65);}
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
  const {scale,centerX,centerY,rotation,worldCenter}=cameraView(bounds);
  ctx.save();ctx.translate(centerX,centerY);ctx.scale(scale,scale);
  ctx.rotate(rotation);ctx.translate(-worldCenter.x,-worldCenter.y);
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
  ctx.save();
  const basis=drag?drag.basis:currentControlBasis(bounds);
  const origin={x:basis.origin.x-bounds.left,y:basis.origin.y-bounds.top};
  const straightHalfWidth=basis.span*STEERING_DEAD_ZONE,extent=Math.hypot(bounds.width,bounds.height)*2;
  ctx.beginPath();ctx.rect(0,60,bounds.width,bounds.height-153);ctx.clip();
  ctx.translate(origin.x,origin.y);ctx.transform(basis.right.x,basis.right.y,-basis.forward.x,-basis.forward.y,0,0);
  ctx.fillStyle='#6f9b6412';ctx.fillRect(-straightHalfWidth,-extent,straightHalfWidth*2,extent*2);
  ctx.strokeStyle='#74926b70';ctx.lineWidth=.8;ctx.setLineDash([3,6]);ctx.beginPath();
  for(const x of [-straightHalfWidth,straightHalfWidth]){ctx.moveTo(x,-extent);ctx.lineTo(x,extent);}ctx.stroke();
  ctx.strokeStyle='#426a5480';ctx.lineWidth=1;ctx.setLineDash([6,6]);
  ctx.beginPath();ctx.moveTo(0,-extent);ctx.lineTo(0,extent);ctx.stroke();ctx.setLineDash([]);
  if(mode==='map'||overview)line([{x:-7,y:-86},{x:0,y:-100},{x:7,y:-86}],'#55734b',2);
  ctx.restore();ctx.save();
  if(mode==='map'||overview){
    const x=origin.x+basis.forward.x*117,y=origin.y+basis.forward.y*117;
    if(x>20&&x<bounds.width-20&&y>75&&y<bounds.height-110)text('前進',x,y,10,'#55734b');
  }
  ctx.fillStyle='#f7f9f0e8';ctx.beginPath();ctx.roundRect(centerX-49,bounds.height-94,98,20,5);ctx.fill();
  text('直進エリア · 0°',centerX,bounds.height-84,10,'#55734b');ctx.restore();
  if(drag && Math.hypot(drag.dx,drag.dy)>2) {
    const x=drag.x-bounds.left,y=drag.y-bounds.top;
    ctx.save();ctx.strokeStyle='#547c5599';ctx.fillStyle='#547c5518';ctx.lineWidth=1;ctx.setLineDash([4,4]);
    ctx.beginPath();ctx.arc(x,y,17,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+drag.dx,y+drag.dy);ctx.stroke();ctx.setLineDash([]);
    ctx.beginPath();ctx.arc(x+drag.dx,y+drag.dy,6,0,Math.PI*2);ctx.fillStyle='#547c55bb';ctx.fill();ctx.restore();
  }
}
function frame(time){const dt=lastTime?Math.min((time-lastTime)/1000,.05):0;lastTime=time;if(activeScreen==='play'){update(dt);render();}requestAnimationFrame(frame);}
reset();applyRoute();requestAnimationFrame(frame);
