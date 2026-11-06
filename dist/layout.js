import { corners, overlaps } from './physics.js';

export const DEFAULT_LAYOUT = { bayWidth: 3.4, bayDepth: 7, aisleWidth: 11.2 };
export const DIMENSION_LIMITS = { bayWidth: [2.2, 4], bayDepth: [4.8, 8], aisleWidth: [3, 12] };

export function createLayout(settings = DEFAULT_LAYOUT) {
  for (const [key, [min, max]] of Object.entries(DIMENSION_LIMITS)) {
    if (!Number.isFinite(settings[key]) || settings[key] < min || settings[key] > max) {
      throw new RangeError(`${key}: ${min}〜${max}mの範囲で指定してください。`);
    }
  }
  const { bayWidth, bayDepth, aisleWidth } = settings;
  const top = 3.8, entrance = top + bayDepth, bottom = entrance + aisleWidth;
  const target = { x: 17, y: top + bayDepth / 2, heading: -Math.PI / 2 };
  const left = target.x - bayWidth * 2.5 - 3, right = target.x + bayWidth * 2.5 + 3;
  const bays = [-2,-1,0,1,2].map(offset => ({ x: target.x + offset * bayWidth, y: target.y }));
  const colors = ['#b7bcb3','#e3d9c6','#a2b3ae','#c3c6b8'];
  const parked = bays.filter((_,i) => i !== 2).map((bay,i) => ({...bay, heading: target.heading, color: colors[i]}));
  const start = { x: target.x + Math.min(7, bayWidth * 2), y: entrance + aisleWidth / 2 + .4, heading: Math.PI };
  return { ...settings, top, entrance, bottom, left, right, bays, parked, target, start };
}

export function isBlocked(car, layout) {
  const shape = corners(car);
  if (shape.some(p => p.x < layout.left || p.x > layout.right || p.y < layout.top || p.y > layout.bottom)) return true;
  return layout.parked.some(p => overlaps(shape, corners(p)));
}

export function isParked(car, layout) {
  return corners(car).every(p => p.x > layout.target.x - layout.bayWidth / 2 && p.x < layout.target.x + layout.bayWidth / 2 && p.y > layout.top && p.y < layout.entrance);
}
