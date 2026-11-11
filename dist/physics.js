export const CAR = { length: 4.4, width: 1.8, wheelbase: 2.6, maxSteer: Math.PI / 5, maxWheel: Math.PI * 3, rearOffset: 1.3 };
// Each side of the center occupies 5% of the play area's width.
export const STEERING_DEAD_ZONE = .05;
export const CREEP_SPEED = .3; // m/s, about 1.1 km/h while held without vertical dragging.
export const ACCEL_DRAG_THRESHOLD = 4; // Pixels along the forward axis; ignore small touch jitter.
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
export function dragInput(x, dy, viewportWidth, sensitivity=100) {
  const left=viewportWidth*(.5-STEERING_DEAD_ZONE),right=viewportWidth*(.5+STEERING_DEAD_ZONE);
  let steering=0;
  if(x<left)steering=(x-left)/left;
  else if(x>right)steering=(x-right)/(viewportWidth-right);
  return { wheel: clamp(steering,-1,1)*CAR.maxWheel, speed: clamp(-dy / sensitivity, -1, 1) * 2 };
}

export function createControlBasis(origin, heading, width, height) {
  const clean=value=>Math.abs(value)<1e-12?0:value;
  const forward={x:clean(Math.cos(heading)),y:clean(Math.sin(heading))};
  const right={x:-forward.y,y:forward.x};
  return {origin:{...origin},forward,right,span:Math.abs(right.x)*width+Math.abs(right.y)*height};
}

export function pointerInput(point, start, basis) {
  const lateral=(point.x-basis.origin.x)*basis.right.x+(point.y-basis.origin.y)*basis.right.y;
  const forwardDrag=(point.x-start.x)*basis.forward.x+(point.y-start.y)*basis.forward.y;
  return {...dragInput(basis.span/2+lateral,-forwardDrag,basis.span),forwardDrag};
}
