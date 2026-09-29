import { createHash } from 'node:crypto';

export function stableUuid(value: string): string {
  const h = createHash('sha256').update(value).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export class Random {
  private state: number;
  constructor(seed: string | number) {
    this.state = 2166136261;
    for (const c of String(seed)) this.state = Math.imul(this.state ^ c.charCodeAt(0), 16777619);
  }
  next(): number {
    this.state = (this.state + 0x6D2B79F5) | 0;
    let n = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  }
  between(min: number, max: number): number { return min + this.next() * (max - min); }
  chance(p: number): boolean { return this.next() < Math.max(0, Math.min(1, p)); }
  pick<T>(items: readonly T[]): T {
    if (!items.length) throw new Error('Cannot choose from an empty list.');
    return items[Math.floor(this.next() * items.length)];
  }
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    const weights = items.map(i => Math.max(0.0001, weight(i)));
    let target = this.next() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) { target -= weights[i]; if (target <= 0) return items[i]; }
    return items[items.length - 1];
  }
  logNormal(median: number, sigma: number): number {
    const z = Math.sqrt(-2 * Math.log(Math.max(1e-9, this.next()))) * Math.cos(2 * Math.PI * this.next());
    return Math.max(200, Math.min(30000, Math.round(median * Math.exp(sigma * z))));
  }
}
