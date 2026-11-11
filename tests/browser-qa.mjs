import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const origin=process.argv.includes('--local')?'http://127.0.0.1:4173':'https://parking-lab-sgk-20261106.playfuldart.chatgpt.site';
const recording=!process.argv.includes('--no-recording');
const scenariosMode=process.argv.includes('--scenarios');
const deadZoneMode=process.argv.includes('--dead-zone');
const absoluteMode=process.argv.includes('--absolute');
const output=path.resolve('tests/artifacts');
await fs.mkdir(output,{recursive:true});
const profile=await fs.mkdtemp('/tmp/parking-lab-chrome-');
const chrome=spawn('/usr/bin/google-chrome',[
  '--headless=new','--no-sandbox','--remote-debugging-pipe',`--user-data-dir=${profile}`,
  '--disable-background-networking','--disable-sync','--no-first-run','--no-default-browser-check',
  '--window-size=1360,1000','about:blank'
],{stdio:['ignore','ignore','pipe','pipe','pipe']});
let serial=0,buffer='',errors='';
const pending=new Map(),listeners=[];
chrome.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-5000);});
chrome.stdio[4].on('data',chunk=>{
  buffer+=chunk.toString();
  for(let index;(index=buffer.indexOf('\0'))>=0;){
    const raw=buffer.slice(0,index);buffer=buffer.slice(index+1);if(!raw)continue;
    const msg=JSON.parse(raw);
    if(msg.id){const p=pending.get(msg.id);if(p){pending.delete(msg.id);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);}}
    else for(const handler of [...listeners])handler(msg);
  }
});
chrome.on('exit',code=>{for(const p of pending.values())p.reject(Error(`Chrome exited ${code}: ${errors}`));});
function send(method,params={},sessionId){
  return new Promise((resolve,reject)=>{
    const id=++serial;pending.set(id,{resolve,reject});
    chrome.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');
    setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error(`Timed out: ${method}`));}},25000).unref();
  });
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function once(method,session){
  return new Promise((resolve,reject)=>{
    const handler=msg=>{if(msg.method===method&&msg.sessionId===session){clearTimeout(timer);listeners.splice(listeners.indexOf(handler),1);resolve(msg.params);}};
    const timer=setTimeout(()=>{listeners.splice(listeners.indexOf(handler),1);reject(Error(`Missing event ${method}`));},20000);
    listeners.push(handler);
  });
}
const instrumentation=`
globalThis.__parkingQA={contexts:[],analysers:[],destination:null};
{
 const NativeAudioContext=window.AudioContext;
 window.AudioContext=class extends NativeAudioContext {
  constructor(...args){super(...args);__parkingQA.contexts.push(this);}
  createAnalyser(){const analyser=super.createAnalyser();__parkingQA.analysers.push(analyser);if(__parkingQA.destination)analyser.connect(__parkingQA.destination);return analyser;}
 };
}
__parkingQA.startRecording=()=>{
 const context=__parkingQA.contexts[0];
 __parkingQA.destination=context.createMediaStreamDestination();
 __parkingQA.chunks=[];
 __parkingQA.recorder=new MediaRecorder(__parkingQA.destination.stream,{mimeType:'audio/webm;codecs=opus'});
 __parkingQA.recorder.ondataavailable=e=>{if(e.data.size)__parkingQA.chunks.push(e.data);};
 __parkingQA.recorder.start();
};
__parkingQA.finishRecording=()=>new Promise(resolve=>{
 __parkingQA.recorder.onstop=async()=>{
  const bytes=new Uint8Array(await new Blob(__parkingQA.chunks,{type:'audio/webm'}).arrayBuffer());
  let binary='';for(let start=0;start<bytes.length;start+=8192)binary+=String.fromCharCode(...bytes.subarray(start,start+8192));
  __parkingQA.destination=null;resolve(btoa(binary));
 };
 __parkingQA.recorder.stop();
});`;
const resultsFile=absoluteMode?'absolute-browser-qa.json':deadZoneMode?'dead-zone-browser-qa.json':scenariosMode?'scenarios-browser-qa.json':recording?'browser-qa.json':'browser-qa-unrecorded.json';
const results={site:origin,recording,started:new Date().toISOString(),scope:'Real Linux Chrome, desktop and emulated touch. Does not verify Android hardware or physical speakers. Success pose is established with the debugger to isolate the audio integration.',cases:[]};
try {
  results.browser=await send('Browser.getVersion');
  console.log(JSON.stringify({phase:'browser-connected',browser:results.browser.product}));
  for(const input of ['mouse','touch']){
    const {targetId}=await send('Target.createTarget',{url:'about:blank'});
    const {sessionId:s}=await send('Target.attachToTarget',{targetId,flatten:true});
    const evaluate=async expression=>{
      const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},s);
      if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;
    };
    await send('Page.enable',{},s);await send('Runtime.enable',{},s);
    await send('Page.addScriptToEvaluateOnNewDocument',{source:`globalThis.__parkingSignalEvents=[];document.addEventListener('DOMContentLoaded',()=>{new MutationObserver(()=>__parkingSignalEvents.push(document.querySelector('#sound-signal').textContent)).observe(document.querySelector('#sound-signal'),{childList:true,subtree:true,characterData:true});});`},s);
    if(recording)await send('Page.addScriptToEvaluateOnNewDocument',{source:instrumentation},s);
    if(input==='touch'){
      await send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:1,mobile:true},s);
      await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1},s);
    }
    const loaded=once('Page.loadEventFired',s);
    await send('Page.navigate',{url:origin},s);await loaded;await wait(500);
    const rect=selector=>evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    const down=async p=>input==='mouse'?send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1},s):send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:1}]},s);
    const move=async p=>input==='mouse'?send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y,button:'left',buttons:1},s):send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x,y:p.y,id:1}]},s);
    const up=async p=>input==='mouse'?send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1},s):send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},s);
    const snapshot=()=>evaluate(`({status:document.querySelector('#status').textContent,sound:document.querySelector('#sound-status').textContent,signal:document.querySelector('#sound-signal').textContent,contexts:typeof __parkingQA==='undefined'?[]:__parkingQA.contexts.map(c=>({state:c.state,time:c.currentTime,sampleRate:c.sampleRate})),gate:document.querySelector('#sound-gate').hidden})`);
    const gallery=await evaluate("({count:document.querySelectorAll('.map-card').length,svg:document.querySelectorAll('.map-card svg').length,visible:!document.querySelector('#map-screen').hidden,playHidden:document.querySelector('#play-screen').hidden,overflow:document.documentElement.scrollWidth>innerWidth})");
    if(gallery.count!==10||gallery.svg!==10||!gallery.visible||!gallery.playHidden||gallery.overflow)throw Error(`${input}: invalid thumbnail gallery`);
    results.cases.push({input,name:'thumbnail-gallery',...gallery,passed:true});
    const metrics=await send('Page.getLayoutMetrics',{},s);
    await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:metrics.cssContentSize.width,height:metrics.cssContentSize.height,scale:1}},s).then(r=>fs.writeFile(path.join(output,`${input}-map-gallery.png`),Buffer.from(r.data,'base64')));
    const mapIds=await evaluate("Array.from(document.querySelectorAll('.map-card')).map(card=>card.dataset.scenario)");
    async function selectMap(id){
      const selector=`button[data-scenario="${id}"]`;
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
      const card=await rect(selector);await down(card);await wait(60);await up(card);await wait(150);
      const route=await evaluate("({hash:location.hash,mapsHidden:document.querySelector('#map-screen').hidden,playHidden:document.querySelector('#play-screen').hidden})");
      if(route.hash!==`#play/${id}`||!route.mapsHidden||route.playHidden)throw Error(`${input}/${id}: card did not open play`);
      results.cases.push({input,name:'thumbnail-selection',id,...route,passed:true});
    }
    await selectMap('standard');
    await evaluate("document.querySelector('#sound-start').scrollIntoView({block:'center'})");
    const gate=await rect('#sound-start');await down(gate);await wait(80);await up(gate);await wait(1500);
    results.cases.push({input,name:'initial-audio-activation',...await snapshot()});
    console.log(JSON.stringify({phase:'activated',input,...await snapshot()}));
    if(absoluteMode){
      await send('Debugger.enable',{},s);
      const source=await fs.readFile('dist/app.js','utf8');
      const line=source.slice(0,source.indexOf('  parkedOk=!drag && speed===0 && !blocked(car)')).split('\n').length-1;
      for(const mode of ['car','map'])for(const [label,heading] of [['right',0],['down',Math.PI/2],['left',Math.PI],['up',-Math.PI/2],['diagonal',Math.PI/4]]){
        await evaluate("document.querySelector('#reset').click();document.querySelector('.simulation').scrollIntoView({block:'center'})");
        const position=await rect('#scene');
        const breakpoint=await send('Debugger.setBreakpointByUrl',{urlRegex:'/app\\.js',lineNumber:line},s);
        await down(position);const paused=once('Debugger.paused',s);const released=up(position);const pause=await paused;
        await send('Debugger.evaluateOnCallFrame',{callFrameId:pause.callFrames[0].callFrameId,expression:`car={...layout.start,heading:${heading}};speed=0;wheel=0;`},s);
        await send('Debugger.removeBreakpoint',{breakpointId:breakpoint.breakpointId},s);await send('Debugger.resume',{},s);await released;
        await evaluate(`document.querySelector('#${mode}-mode').click()`);
        const bounds=await evaluate("(()=>{const r=document.querySelector('#scene').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2-.5,width:r.width,height:r.height};})()");
        const angle=mode==='car'?-Math.PI/2:heading;
        const forward={x:Math.cos(angle),y:Math.sin(angle)},right={x:-Math.sin(angle),y:Math.cos(angle)};
        const span=Math.abs(right.x)*bounds.width+Math.abs(right.y)*bounds.height;
        const forwardSpan=Math.abs(forward.x)*bounds.width+Math.abs(forward.y)*bounds.height;
        const point=(f,r)=>({x:bounds.x+forward.x*f+right.x*r,y:bounds.y+forward.y*f+right.y*r});
        async function check(name,p,gear,tireSign,action=move){
          await action(p);await wait(100);
          const state=await evaluate("({gear:document.querySelector('#gear').textContent,speed:document.querySelector('#speed').textContent,tire:document.querySelector('#tire-text').textContent})");
          const angle=parseInt(state.tire),passed=state.gear===gear&&(tireSign===0?angle===0:angle*tireSign>0)&&(gear!=='N'||state.speed==='0.0');
          results.cases.push({input,mode,name:`${label}-${name}`,...state,passed});if(!passed)throw Error(`${input}/${mode}/${label}/${name}: absolute controls failed: ${JSON.stringify(state)}`);
        }
        await check('press-center-stays-stopped',point(0,0),'N',0,down);
        await check('front-position',point(forwardSpan*.18,0),'D',0);
        await check('rear-position',point(-forwardSpan*.18,0),'R',0);
        await check('stopped-right-steering',point(0,span*.18),'N',1);
        await check('stopped-left-steering',point(0,-span*.18),'N',-1);
        await check('intersection-stops-and-straightens',point(0,0),'N',0);
        await up(point(0,0));
        await check('rear-press-reverses-without-drag',point(-forwardSpan*.18,0),'R',0,down);await up(point(0,0));
        await check('front-press-drives-without-drag',point(forwardSpan*.18,0),'D',0,down);
        await check('forward-and-right',point(forwardSpan*.15,span*.15),'D',1);
        await send('Page.captureScreenshot',{format:'png'},s).then(r=>fs.writeFile(path.join(output,`${input}-absolute-${mode}-${label}.png`),Buffer.from(r.data,'base64')));
        const stopLine=source.slice(0,source.indexOf("  stop();\n  if(event!=='pointerup')return;")).split('\n').length-1;
        const stopBreakpoint=await send('Debugger.setBreakpointByUrl',{urlRegex:'/app\\.js',lineNumber:stopLine},s);
        const stopping=once('Debugger.paused',s),releasing=up(point(0,0));const beforePause=await stopping;
        const readPose=async pause=>(await send('Debugger.evaluateOnCallFrame',{callFrameId:pause.callFrames[0].callFrameId,expression:'({car:{...car},mapCenter:{...mapCenter},view:cameraView(canvas.getBoundingClientRect()),speed})',returnByValue:true},s)).result.value;
        const before=await readPose(beforePause);
        const stepping=once('Debugger.paused',s);await send('Debugger.stepOver',{},s);const after=await readPose(await stepping);
        const passed=before.car.x===after.car.x&&before.car.y===after.car.y&&before.car.heading===after.car.heading&&after.speed===0&&Math.abs(after.view.carX-after.view.centerX)<.001&&Math.abs(after.view.carY-after.view.centerY)<.001&&(mode!=='map'||after.view.rotation===0&&after.mapCenter.x===after.car.x&&after.mapCenter.y===after.car.y);
        results.cases.push({input,mode,name:`${label}-release-stops-and-centers`,before,after,passed});
        await send('Debugger.removeBreakpoint',{breakpointId:stopBreakpoint.breakpointId},s);await send('Debugger.resume',{},s);await releasing;
        if(!passed)throw Error(`${input}/${mode}/${label}: release changed the pose or failed to stop and center`);
      }
      console.log(JSON.stringify({phase:'absolute-position-verified',input}));
      await send('Target.closeTarget',{targetId});continue;
    }
    if(deadZoneMode){
      await evaluate("document.querySelector('.simulation').scrollIntoView({block:'center'})");
      const bounds=await evaluate("(()=>{const r=document.querySelector('#scene').getBoundingClientRect();return {left:r.left,width:r.width,y:r.top+r.height/2};})()");
      for(const ratio of [.4,.46,.5,.54,.6]){
        const point={x:bounds.left+bounds.width*ratio,y:bounds.y};
        await down(point);await move({x:point.x,y:point.y-50});await wait(120);
        const state=await evaluate("({tire:document.querySelector('#tire-text').textContent,wheel:document.querySelector('#wheel-text').textContent,gear:document.querySelector('#gear').textContent})");
        const straight=ratio>=.45&&ratio<=.55;
        const passed=state.gear==='D'&&(straight?state.tire==='0°'&&state.wheel==='まっすぐ':parseInt(state.tire)*(ratio<.5?-1:1)>0);
        results.cases.push({input,name:'steering-dead-zone',ratio,...state,passed});
        if(!passed)throw Error(`${input}: incorrect steering at ${ratio}`);
        if(ratio===.54)await send('Page.captureScreenshot',{format:'png'},s).then(r=>fs.writeFile(path.join(output,`${input}-dead-zone.png`),Buffer.from(r.data,'base64')));
        await up(point);
      }
      console.log(JSON.stringify({phase:'dead-zone-verified',input}));
      await send('Target.closeTarget',{targetId});continue;
    }
    if(scenariosMode){
      await send('Debugger.enable',{},s);
      const source=await fs.readFile('dist/app.js','utf8');
      const line=source.slice(0,source.indexOf('  parkedOk=!drag && speed===0 && !blocked(car)')).split('\n').length-1;
      const ids=mapIds;
      for(const id of ids){
        await evaluate("document.querySelector('#back-to-maps').click()");await wait(100);
        if(!await evaluate("!document.querySelector('#map-screen').hidden&&document.querySelector('#play-screen').hidden"))throw Error(`${input}: back button did not open maps`);
        await selectMap(id);
        await evaluate("document.querySelector('.simulation').scrollIntoView({block:'center'});if(document.querySelector('#overview').getAttribute('aria-pressed')!=='true')document.querySelector('#overview').click()");
        await wait(120);
        await send('Page.captureScreenshot',{format:'png'},s).then(r=>fs.writeFile(path.join(output,`${input}-${id}-overview.png`),Buffer.from(r.data,'base64')));
        const position=await rect('#scene');
        let geometry;
        for(const wrongDirection of [true,false]){
          const breakpoint=await send('Debugger.setBreakpointByUrl',{urlRegex:'/app\\.js',lineNumber:line},s);
          await down(position);const paused=once('Debugger.paused',s);const released=up(position);const pause=await paused;
          const check=await send('Debugger.evaluateOnCallFrame',{callFrameId:pause.callFrames[0].callFrameId,expression:`(()=>{const info={id:layout.scenarioId,safeStart:!blocked(car),parkedCars:layout.parked.length,directed:layout.directed,goalHeading:layout.target.heading};car={...layout.target,heading:layout.target.heading+${wrongDirection?'Math.PI':'0'}};speed=0;contactPosition=null;successCelebrated=false;return info;})()`,returnByValue:true},s);
          geometry=check.result.value;
          await send('Debugger.removeBreakpoint',{breakpointId:breakpoint.breakpointId},s);await send('Debugger.resume',{},s);await released;await wait(300);
          const state=await snapshot();
          const expectedSuccess=!wrongDirection||!geometry.directed;
          const passed=state.status.startsWith('駐車成功')===expectedSuccess;
          results.cases.push({input,name:id,wrongDirection,geometry,...state,passed});
          if(!passed)throw Error(`${input}/${id}: incorrect heading acceptance`);
        }
        console.log(JSON.stringify({phase:'scenario-tested',input,id,geometry}));
      }
      const history=await send('Page.getNavigationHistory',{},s);
      await send('Page.navigateToHistoryEntry',{entryId:history.entries[history.currentIndex-1].id},s);await wait(150);
      if(!await evaluate("!document.querySelector('#map-screen').hidden&&document.querySelector('#play-screen').hidden"))throw Error(`${input}: browser Back did not restore gallery`);
      await send('Page.navigateToHistoryEntry',{entryId:history.entries[history.currentIndex].id},s);await wait(150);
      if(!await evaluate("document.querySelector('#map-screen').hidden&&!document.querySelector('#play-screen').hidden"))throw Error(`${input}: browser Forward did not restore play`);
      results.cases.push({input,name:'browser-back-and-forward',passed:true});
      await send('Target.closeTarget',{targetId});continue;
    }
    const canvas=await rect('#scene');
    async function capture(name,action,duration){
      const eventStart=await evaluate('__parkingSignalEvents.length');
      if(recording)await evaluate('__parkingQA.startRecording()');await action();await wait(duration);
      const state=await snapshot();let file=null;
      state.newSignalEvents=await evaluate(`__parkingSignalEvents.slice(${eventStart})`);
      state.passed=state.status.startsWith('接触しました')&&state.newSignalEvents.some(text=>text.includes('衝突音：音声の波形を確認しました'));
      if(recording){const encoded=await evaluate('__parkingQA.finishRecording()');file=`${input}-${name}.webm`;await fs.writeFile(path.join(output,file),Buffer.from(encoded,'base64'));}
      results.cases.push({input,name,file,...state});console.log(JSON.stringify({phase:'case',input,name,...state}));
      if(!state.passed)throw Error(`${input}/${name}: collision or fresh audio signal was not observed`);
    }
    await capture('drive-into-wall',async()=>{await down(canvas);await move({x:canvas.x,y:canvas.y-110});},10000);
    await up(canvas);await wait(300);
    await capture('repeat-same-wall',async()=>{await down(canvas);await move({x:canvas.x,y:canvas.y-110});},1200);
    await up(canvas);await wait(300);
    await capture(recording?'suspended-audio-wall':'after-idle-wall',async()=>{
      if(recording)await evaluate('__parkingQA.contexts[0].suspend()');
      else await wait(2000);
      await down(canvas);await move({x:canvas.x,y:canvas.y-110});
    },1200);
    await up(canvas);await wait(300);
    // Establish a valid parking pose at the release handler to isolate audio
    // from maneuvering skill. No production source or server state is changed.
    await send('Debugger.enable',{},s);
    const source=await fs.readFile('dist/app.js','utf8');
    const line=source.slice(0,source.indexOf('  parkedOk=!drag && speed===0 && !blocked(car)')).split('\n').length-1;
    const breakpoint=await send('Debugger.setBreakpointByUrl',{urlRegex:'/app\\.js',lineNumber:line},s);
    await down(canvas);
    const successEventStart=await evaluate('__parkingSignalEvents.length');
    if(recording)await evaluate('__parkingQA.startRecording()');
    const paused=once('Debugger.paused',s);const released=up(canvas);const pause=await paused;
    await send('Debugger.evaluateOnCallFrame',{callFrameId:pause.callFrames[0].callFrameId,expression:'car={...layout.target};speed=0;contactPosition=null;successCelebrated=false;'},s);
    await send('Debugger.removeBreakpoint',{breakpointId:breakpoint.breakpointId},s);await send('Debugger.resume',{},s);await released;await wait(1600);
    const successState=await snapshot();let file=null;
    successState.newSignalEvents=await evaluate(`__parkingSignalEvents.slice(${successEventStart})`);
    successState.passed=successState.status.startsWith('駐車成功')&&successState.newSignalEvents.some(text=>text.includes('成功音：音声の波形を確認しました'));
    if(recording){const encoded=await evaluate('__parkingQA.finishRecording()');file=`${input}-parking-success.webm`;await fs.writeFile(path.join(output,file),Buffer.from(encoded,'base64'));}
    results.cases.push({input,name:'parking-success',file,...successState});console.log(JSON.stringify({phase:'case',input,name:'parking-success',...successState}));
    if(!successState.passed)throw Error(`${input}/parking-success: fresh success signal was not observed`);
    await send('Page.captureScreenshot',{format:'png'},s).then(r=>fs.writeFile(path.join(output,`${input}${recording?'':'-unrecorded'}-success.png`),Buffer.from(r.data,'base64')));
    await send('Target.closeTarget',{targetId});
  }
  results.finished=new Date().toISOString();await fs.writeFile(path.join(output,resultsFile),JSON.stringify(results,null,2));
  console.log(JSON.stringify({phase:'complete',cases:results.cases.length,output}));
} catch(error){
  results.error=String(error);await fs.writeFile(path.join(output,resultsFile),JSON.stringify(results,null,2));
  console.error(String(error));process.exitCode=1;
} finally {chrome.kill('SIGTERM');}
