export type ProportionInterval = {
  estimate: number;
  low: number;
  high: number;
  n: number;
  successes: number;
};

/**
 * Wilson score interval for a binomial proportion (95% by default, z=1.96).
 * Used by `coach eval` for detection recall / within-tolerance rates.
 */
export function wilsonInterval(
  successes: number,
  n: number,
  z = 1.96,
): ProportionInterval {
  if (n <= 0) {
    return { estimate: 0, low: 0, high: 0, n: 0, successes: 0 };
  }
  if (successes < 0 || successes > n) {
    throw new RangeError('successes must be between 0 and n');
  }
  const phat = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = phat + z2 / (2 * n);
  const margin = z * Math.sqrt((phat * (1 - phat) + z2 / (4 * n)) / n);
  return {
    estimate: phat,
    low: Math.max(0, (center - margin) / denom),
    high: Math.min(1, (center + margin) / denom),
    n,
    successes,
  };
}
