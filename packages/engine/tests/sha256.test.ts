import { createHash } from 'node:crypto';
import { sha256Hex } from '../src';

describe('sha256Hex', () => {
  it.each(['', 'abc', 'error:api:7', 'critical:payment-service:10', 'ünïcödé→✓', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(1000)])(
    'matches node:crypto for %#',
    (input: string) => {
      expect(sha256Hex(input)).toBe(createHash('sha256').update(input).digest('hex'));
    },
  );
});
