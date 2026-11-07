import { CAR, corners } from './physics.js';

export function mapThumbnail(layout) {
  const {left,right,top,bottom,target,bays,parked,start}=layout;
  const polygon=bay=>corners(bay,bay.length,bay.width).map(p=>`${p.x},${p.y}`).join(' ');
  function vehicle(car,color) {
    return `<g transform="translate(${car.x} ${car.y}) rotate(${car.heading*180/Math.PI})">
      <g fill="#586353"><rect x="-1.6" y="-.99" width=".65" height=".22" rx=".04"/><rect x="1" y="-.99" width=".65" height=".22" rx=".04"/><rect x="-1.6" y=".77" width=".65" height=".22" rx=".04"/><rect x="1" y=".77" width=".65" height=".22" rx=".04"/></g>
      <rect x="-2.2" y="-.85" width="4.4" height="1.7" rx=".28" fill="${color}" stroke="#8d9c83" stroke-width=".035"/>
      <rect x="-.95" y="-.66" width="1.6" height="1.32" rx=".15" fill="#e1e8d7"/>
      <rect x=".65" y="-.63" width=".52" height="1.26" rx=".08" fill="#597768"/>
      <rect x="-1.45" y="-.58" width=".38" height="1.16" rx=".08" fill="#8da08b"/>
      <path d="M1.48 0h.36m-.16-.14.16.14-.16.14" fill="none" stroke="#4d7351" stroke-width=".07"/>
    </g>`;
  }
  const shape=bays.map(bay=>`<polygon points="${polygon(bay)}" fill="${bay.isTarget?'#c9dfb6':'#e5ebde'}" stroke="${bay.isTarget?'#6c9b62':'#ffffff'}" stroke-width="${bay.isTarget?'.09':'.06'}" ${bay.isTarget?'stroke-dasharray=".2 .12"':''}/>`).join('');
  const wall=layout.scenarioId==='dead-end-left'?`<path d="M${left} ${top}V${bottom}" stroke="#73836c" stroke-width=".3"/>`:layout.scenarioId==='dead-end-right'?`<path d="M${right} ${top}V${bottom}" stroke="#73836c" stroke-width=".3"/>`:'';
  return `<svg class="map-thumbnail" viewBox="${left-1} ${top-1} ${right-left+2} ${bottom-top+2}" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <rect x="${left-1}" y="${top-1}" width="${right-left+2}" height="${bottom-top+2}" fill="#eaf0e4"/>
    <rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}" rx=".18" fill="#f4f5ed" stroke="#adbaa0" stroke-width=".16"/>
    ${shape}${wall}
    <path d="M${left+.5} ${layout.entrance+layout.aisleWidth/2}H${right-.5}" fill="none" stroke="#dbe3d2" stroke-width=".06" stroke-dasharray=".35 .3"/>
    <g transform="translate(${target.x} ${target.y}) rotate(${target.heading*180/Math.PI})">
      <rect x="${-CAR.length/2}" y="${-CAR.width/2}" width="${CAR.length}" height="${CAR.width}" fill="#c8deda44" stroke="#588894" stroke-width=".07" stroke-dasharray=".2 .12"/>
      ${layout.directed?'<path d="M-.65 0H1.3m-.4-.3.4.3-.4.3" fill="none" stroke="#588894" stroke-width=".09"/>':''}
    </g>
    ${parked.map(car=>vehicle(car,car.color)).join('')}${vehicle(start,'#a3c884')}
  </svg>`;
}

export function mapCards(scenarios, createLayout) {
  const rules={either:'向き自由',reverse:'バック指定',forward:'前向き指定',aligned:'縦列駐車'};
  return scenarios.map((scenario,index)=>{
    const layout=createLayout({...scenario.defaults},scenario.id);
    return `<button type="button" class="map-card" data-scenario="${scenario.id}" aria-label="${scenario.title}を練習する">
      <div class="map-preview">${mapThumbnail(layout)}<span class="map-number">${String(index+1).padStart(2,'0')}</span><span class="map-category">${scenario.category}</span></div>
      <div class="map-card-body"><div class="map-card-title"><h2>${scenario.title}</h2><span aria-hidden="true">↗</span></div><p>${scenario.description}</p>
      <div class="map-card-footer"><span>${rules[scenario.rule]}</span><span>通路 ${scenario.defaults.aisleWidth.toFixed(1)}m</span></div></div>
    </button>`;
  }).join('');
}
