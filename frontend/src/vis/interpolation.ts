export type InterpolationFunction = (t: number) => number;

export const linear: InterpolationFunction = (t: number) => t;

export const easeIn: InterpolationFunction = (t: number) => t * t;

export const easeOut: InterpolationFunction = (t: number) => t * (2 - t);

export const easeInOut: InterpolationFunction = (t: number) =>
  t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

export const easeInCubic: InterpolationFunction = (t: number) => t * t * t;

export const easeOutCubic: InterpolationFunction = (t: number) => {
  const t1 = t - 1;
  return t1 * t1 * t1 + 1;
};

export const easeInOutCubic: InterpolationFunction = (t: number) =>
  t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;

export const elastic: InterpolationFunction = (t: number) => {
  return t === 0 || t === 1
    ? t
    : -Math.pow(2, 10 * (t - 1)) * Math.sin((t - 1.1) * 5 * Math.PI);
};

export const bounce: InterpolationFunction = (t: number) => {
  if (t < 1 / 2.75) {
    return 7.5625 * t * t;
  } else if (t < 2 / 2.75) {
    return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
  } else if (t < 2.5 / 2.75) {
    return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
  } else {
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  }
};

