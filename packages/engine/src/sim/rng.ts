/** A small seeded random generator (mulberry32), so a simulated incident repeats exactly. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** A float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** An integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)] as T;
  }

  /** A latency-like value: log-normal-ish around `median`, never below 1. */
  latency(median: number): number {
    const factor = Math.exp((this.next() + this.next() + this.next() - 1.5) * 0.9);
    return Math.max(1, Math.round(median * factor));
  }
}
