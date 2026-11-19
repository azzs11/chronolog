/**
 * Smallest and largest of many numbers. `Math.min(...values)` passes every value as an argument and
 * throws a RangeError above roughly 100,000 of them, which real incidents (up to 270,000 log lines)
 * exceed, so this loops instead.
 */
export function extent(values: Iterable<number>): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}
