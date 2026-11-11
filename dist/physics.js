export const CAR = { length: 4.4, width: 1.8, wheelbase: 2.6, maxSteer: Math.PI / 5, maxWheel: Math.PI * 3, rearOffset: 1.3 };
// Each side of the center occupies 5% of the play area's width.
export const STEERING_DEAD_ZONE = .05;
export const ACCEL_DEAD_ZONE = .05; // Each side of the car center along the forward axis.
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export function advance(car, speed, wheel, dt) {
  const steer = wheel / CAR.maxWheel * CAR.maxSteer;
  const omega = speed / CAR.wheelbase * Math.tan(steer);
  const rearX = car.x - CAR.rearOffset * Math.cos(car.heading);
  const rearY = car.y - CAR.rearOffset * Math.sin(car.heading);
  const heading = car.heading + omega * dt;
  let x, y;
  if (Math.abs(omega) < 1e-8) {
    x = rearX + speed * dt * Math.cos(car.heading);
    y = rearY + speed * dt * Math.sin(car.heading);
  } else {
    x = rearX + speed / omega * (Math.sin(heading) - Math.sin(car.heading));
    y = rearY - speed / omega * (Math.cos(heading) - Math.cos(car.heading));
  }
  return { x: x + CAR.rearOffset * Math.cos(heading), y: y + CAR.rearOffset * Math.sin(heading), heading };
}
export function corners(car, length = CAR.length, width = CAR.width) {
  const c = Math.cos(car.heading), s = Math.sin(car.heading);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b]) => ({x: car.x + a*length/2*c-b*width/2*s, y: car.y+a*length/2*s+b*width/2*c}));
}
export function overlaps(a, b) {
  for (const poly of [a, b]) for (let i=0;i<poly.length;i++) {
    const p=poly[i], q=poly[(i+1)%poly.length], axis={x: q.y-p.y, y:p.x-q.x};
    const pa=a.map(v=>v.x*axis.x+v.y*axis.y), pb=b.map(v=>v.x*axis.x+v.y*axis.y);
    if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
  }
  return true;
}
export function createControlBasis(origin, heading, width, height) {
  const clean=value=>Math.abs(value)<1e-12?0:value;
  const forward={x:clean(Math.cos(heading)),y:clean(Math.sin(heading))};
  const right={x:-forward.y,y:forward.x};
  return {origin:{...origin},forward,right,span:Math.abs(right.x)*width+Math.abs(right.y)*height,forwardSpan:Math.abs(forward.x)*width+Math.abs(forward.y)*height};
}

function axisInput(distance, span, deadZone) {
  const edge=span*deadZone;
  if(Math.abs(distance)<=edge+1e-9)return 0;
  return Math.sign(distance)*clamp((Math.abs(distance)-edge)/(span/2-edge),0,1);
}

export function pointerInput(point, basis) {
  const dx=point.x-basis.origin.x,dy=point.y-basis.origin.y;
  const lateral=dx*basis.right.x+dy*basis.right.y;
  const forward=dx*basis.forward.x+dy*basis.forward.y;
  return {wheel:axisInput(lateral,basis.span,STEERING_DEAD_ZONE)*CAR.maxWheel,speed:axisInput(forward,basis.forwardSpan,ACCEL_DEAD_ZONE)*2};
}
