// Small helpers shared by the seed, the simulators and the store.

export function seededRng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return withHelpers(next);
}

export const mathRng = () => withHelpers(Math.random);

function withHelpers(next) {
  const rng = () => next();
  rng.int = (min, max) => Math.floor(next() * (max - min + 1)) + min;
  rng.pick = (arr) => arr[Math.floor(next() * arr.length)];
  rng.chance = (p) => next() < p;
  rng.range = (min, max) => next() * (max - min) + min;
  rng.shuffle = (arr) => [...arr].map((v) => [next(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  return rng;
}

let counter = 0;
export const uid = (prefix) => `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export const DAY = 86400000;
export const iso = (ms) => new Date(ms).toISOString();
export const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (isoStr, days) => iso(new Date(isoStr).getTime() + days * DAY);
export const monthKey = (ms) => new Date(ms).toISOString().slice(0, 7);
export const round2 = (n) => Math.round(n * 100) / 100;
